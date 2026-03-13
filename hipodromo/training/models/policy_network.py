import tensorflow as tf
import numpy as np
import json

class RacerPolicy(tf.keras.Model):
    def __init__(self, obs_size=59, rival_slots=3, rival_dims=6):
        super(RacerPolicy, self).__init__()
        self.obs_size = obs_size
        self.rival_slots = rival_slots
        self.rival_dims = rival_dims
        
        # 1. Rival Encoder (Small MLP applied to each rival slot)
        self.rival_dense = tf.keras.layers.Dense(16, activation='tanh', name='rival_encoder')
        
        # 2. Shared Trunk
        self.trunk_l1 = tf.keras.layers.Dense(64, activation='tanh', name='trunk_l1')
        self.trunk_l2 = tf.keras.layers.Dense(48, activation='tanh', name='trunk_l2')
        
        # 3. Policy Heads
        # steer (tanh), throttle (sig), brake (sig), drift (sig), stabilize (sig)
        self.driving_head = tf.keras.layers.Dense(5, name='driving_head')
        self.overtaking_head = tf.keras.layers.Dense(5, name='overtaking_head')
        
        # 4. Mixing Gate
        # Inputs to gate: [min_front_gap (obs[33]), nearest_rival_dist (obs[30]), rel_speed (obs[32])]
        self.gate_dense = tf.keras.layers.Dense(1, activation='sigmoid', name='mixing_gate')

    def call(self, obs):
        # obs shape: (batch, 59)
        
        # Extract blocks based on OBS_SCHEMA_V2
        # self_state: [0:6]
        # track_relation: [6:10]
        # track_sensors: [10:30]
        # rivals: [30:48]
        # world_events: [48:55]
        # world_params: [55:59]
        
        self_state = obs[:, 0:6]
        track_relation = obs[:, 6:10]
        track_sensors = obs[:, 10:30]
        rivals_raw = obs[:, 30:48] # (batch, 18)
        world_events = obs[:, 48:55]
        world_params = obs[:, 55:59]
        
        # Process Rivals with shared encoder
        # Reshape to (batch, 3, 6)
        rivals_reshaped = tf.reshape(rivals_raw, (-1, self.rival_slots, self.rival_dims))
        rival_embeddings = self.rival_dense(rivals_reshaped) # (batch, 3, 16)
        # Max pool over rivals
        rival_pooled = tf.reduce_max(rival_embeddings, axis=1) # (batch, 16)
        
        # Concatenate everything for the trunk
        trunk_input = tf.concat([
            self_state,
            track_relation,
            track_sensors,
            rival_pooled,
            world_events,
            world_params
        ], axis=1) # Total dims: 6 + 4 + 20 + 16 + 7 + 4 = 57 (approx, checking my plan)
        
        x = self.trunk_l1(trunk_input)
        x = self.trunk_l2(x)
        
        # Heads
        driving_raw = self.driving_head(x)
        overtaking_raw = self.overtaking_head(x)
        
        # Activation functions
        def apply_head_activations(raw):
            steer = tf.math.tanh(raw[:, 0:1])
            others = tf.math.sigmoid(raw[:, 1:5])
            return tf.concat([steer, others], axis=1)
            
        driving = apply_head_activations(driving_raw)
        overtaking = apply_head_activations(overtaking_raw)
        
        # Gate
        # Gate inputs: [min_front_gap (obs index 33), nearest_rival_dist (index 30), rel_speed (index 32)]
        # We need to gather these from the batch
        gate_in = tf.stack([
            obs[:, 33], # front_gap
            obs[:, 30], # dist
            obs[:, 32]  # rel_speed
        ], axis=1)
        
        g = self.gate_dense(gate_in) # shape (batch, 1)
        
        # Final Action Blend
        action = (1.0 - g) * driving + g * overtaking
        return action

    def get_flat_weights(self):
        weights = self.get_weights()
        return np.concatenate([w.flatten() for w in weights])

    def set_flat_weights(self, flat_weights):
        new_weights = []
        start = 0
        for w in self.get_weights():
            size = np.prod(w.shape)
            new_weights.append(flat_weights[start:start+size].reshape(w.shape))
            start += size
        self.set_weights(new_weights)

    def count_parameters(self):
        return self.count_params()

if __name__ == "__main__":
    # Internal test/audit
    policy = RacerPolicy()
    dummy_obs = np.zeros((1, 59), dtype=np.float32)
    action = policy(dummy_obs)
    print(f"Policy Output Shape: {action.shape}")
    print(f"Total Parameters: {policy.count_parameters()}")
    
    # Audit weight vector
    flat = policy.get_flat_weights()
    print(f"Flat weights size: {len(flat)}")
