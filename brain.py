# brain.py
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models
from config import NUM_SENSORS, MUTATION_RATE

# Configuración y verificación de GPU/Metal
devices = tf.config.list_physical_devices('GPU')
if len(devices) > 0:
    print(f"✅ TensorFlow detectó GPU (Metal): {devices[0].name}")
else:
    print("⚠️ TensorFlow corriendo en CPU.")

class Brain:
    def __init__(self, weights=None):
        self.model = models.Sequential([
            layers.Input(shape=(NUM_SENSORS,)),
            layers.Dense(5, activation='tanh'),
            layers.Dense(3, activation='tanh'),
            layers.Dense(3, activation='tanh'),
            layers.Dense(2, activation='tanh')
        ])
        
        if weights:
            self.model.set_weights(weights)

    def predict(self, sensors):
        sensors_input = np.array([sensors])
        output = self.model.predict_on_batch(sensors_input)[0]
        return output

    def mutate(self):
        weights = self.model.get_weights()
        for i in range(len(weights)):
            mutation = np.random.normal(0, MUTATION_RATE, weights[i].shape)
            weights[i] += mutation
        self.model.set_weights(weights)

    def get_weights(self):
        return self.model.get_weights()
