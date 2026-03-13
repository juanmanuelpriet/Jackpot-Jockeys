import pytest
import numpy as np
import tensorflow as tf
from models.policy_network import RacerPolicy

def test_policy_dimensions():
    obs_size = 59
    policy = RacerPolicy(obs_size=obs_size)
    
    # Test single observation
    dummy_obs = np.random.uniform(-1, 1, (1, obs_size)).astype(np.float32)
    action = policy(dummy_obs)
    
    assert action.shape == (1, 5)
    
    # Check ranges
    # Steer: [-1, 1]
    # Rest: [0, 1]
    action_np = action.numpy()[0]
    assert -1.05 <= action_np[0] <= 1.05
    for i in range(1, 5):
        assert -0.05 <= action_np[i] <= 1.05

def test_batch_processing():
    batch_size = 16
    obs_size = 59
    policy = RacerPolicy(obs_size=obs_size)
    
    batch_obs = np.random.uniform(-1, 1, (batch_size, obs_size)).astype(np.float32)
    actions = policy(batch_obs)
    
    assert actions.shape == (batch_size, 5)

def test_weights_flat_loading():
    policy = RacerPolicy()
    dummy_obs = np.zeros((1, 59), dtype=np.float32)
    _ = policy(dummy_obs) # build model
    
    flat_weights = policy.get_flat_weights()
    num_params = policy.count_parameters()
    
    assert len(flat_weights) == num_params
    
    # Perturb weights
    new_weights = flat_weights + np.random.normal(0, 0.1, flat_weights.shape)
    policy.set_flat_weights(new_weights)
    
    # Ensure it updated
    after_weights = policy.get_flat_weights()
    assert np.allclose(after_weights, new_weights)

def test_determinism():
    policy = RacerPolicy()
    obs = np.random.uniform(-1, 1, (10, 59)).astype(np.float32)
    
    out1 = policy(obs).numpy()
    out2 = policy(obs).numpy()
    
    assert np.allclose(out1, out2)
