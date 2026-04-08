# tournament.py — Modo Torneo con Arcade
import arcade
import os
import math
import random
import json
import csv
from config import WIDTH, HEIGHT, FPS, COLORS, NUM_CARS
from track import Track
from car import Car
from brain import Brain

WEIGHTS_PATH = "f1_best_brain.weights.h5"

class TournamentWindow(arcade.Window):
    def __init__(self):
        super().__init__(WIDTH, HEIGHT, "F1 Racing ML — Tournament Mode", update_rate=1 / FPS)
        arcade.set_background_color((30, 30, 30))

        if not os.path.exists(WEIGHTS_PATH):
            print(f"\n❌ ERROR: No se encontró el modelo entrenado '{WEIGHTS_PATH}'.")
            arcade.exit()
            return

        # 1. Configurar Pista (Semilla inicial 100)
        self.current_round = 1
        self.max_rounds = 30
        self.track = Track(seed=100)
        self.metrics_data = []
        
        # 2. Configurar Coches
        self.cars_count = 5
        print(f"✅ Cargando campeones pre-entrenados desde '{WEIGHTS_PATH}'...")
        
        # Cargar los pesos una sola vez
        tmp_brain = Brain()
        tmp_brain.model.load_weights(WEIGHTS_PATH)
        self.best_weights = tmp_brain.get_weights()
        
        self.scores = {i: 0 for i in range(self.cars_count)}
        self.cars = self._spawn_cars()
        
        self.show_sensors = True
        self.anyone_finished = False
        self.track_winner_idx = None
        self.event_timer = FPS * 5
        
        self.txt_round = arcade.Text("", 20, HEIGHT - 40, arcade.color.WHITE, 18, bold=True)
        self.txt_keys = arcade.Text("Presiona 'G' (Sensores) | 'R' (Reset)", 20, HEIGHT - 70, (150, 150, 150), 12)

    def _spawn_cars(self):
        cars = []
        for i in range(self.cars_count):
            c = Car(self.track, Brain(self.best_weights))
            c.color = COLORS[i % len(COLORS)]
            # Variación leve para que no todos sigan exactamente la misma línea si hay ruidos
            c.angle += random.uniform(-0.05, 0.05)
            c.x += random.uniform(-2, 2)
            c.y += random.uniform(-2, 2)
            cars.append(c)
        return cars

    def on_update(self, delta_time):
        alive_count = 0
        anyone_finished = False
        winner_idx = None
        
        for i, car in enumerate(self.cars):
            car.update()
            if car.alive and not car.finished:
                alive_count += 1
            if car.finished:
                anyone_finished = True
                winner_idx = i
                break

        # God Events
        if self.event_timer > 0:
            self.event_timer -= 1
        elif alive_count > 0:
            if random.random() < 0.05:
                activos = [c for c in self.cars if c.alive]
                if activos:
                    afortunado = random.choice(activos)
                    ev = random.choice([0, 1, 2])
                    if ev == 0:
                        afortunado.boost_timer = FPS * 3
                    elif ev == 1:
                        for c in activos:
                            if c != afortunado and random.random() > 0.5:
                                c.blind_timer = FPS * 2
                    elif ev == 2:
                        afortunado.frozen_timer = int(FPS * 1.5)
                    self.event_timer = FPS * random.uniform(3, 8)

        if anyone_finished or alive_count == 0:
            if anyone_finished:
                self.scores[winner_idx] += 1
                print(f"🏁 Ronda {self.current_round} terminada. Ganador: Coche {winner_idx + 1}")
            else:
                print(f"💀 Ronda {self.current_round} terminada. Nadie llegó a la meta.")

            # Recopilar métricas de la ronda actual para todos los coches
            seed_used = 100 + self.current_round - 1
            path_len = len(self.track.path_points)
            for i, car in enumerate(self.cars):
                progreso_pct = (car.total_progress / path_len) * 100 if path_len > 0 else 0
                self.metrics_data.append({
                    "Seed": seed_used,
                    "Ronda": self.current_round,
                    "Coche": i + 1,
                    "Color": car.color,
                    "Terminado": car.finished,
                    "Progreso_Pct": round(progreso_pct, 2),
                    "Tiempo_Lap_Ticks": car.lap_time,
                    "Puntaje_Final": round(car.score, 2),
                    "Ganador": (i == winner_idx) if anyone_finished else False
                })

            self.current_round += 1
            if self.current_round > self.max_rounds:
                print("\n🏎️🏆 ¡Torneo Finalizado! 🏆🏎️")
                for i in range(self.cars_count):
                    print(f"Coche {i+1}: {self.scores[i]} victorias")
                
                # Exportar métricas a CSV
                csv_file = "tournament_metrics.csv"
                keys = self.metrics_data[0].keys()
                with open(csv_file, 'w', newline='') as output_file:
                    dict_writer = csv.DictWriter(output_file, keys)
                    dict_writer.writeheader()
                    dict_writer.writerows(self.metrics_data)
                print(f"\n📊 Métricas exportadas exitosamente a '{csv_file}'")
                
                arcade.exit()
                return

            # Generar nueva ronda con seed específica (100-109)
            self.track.generate(seed=100 + self.current_round - 1)
            self.cars = self._spawn_cars()

    def on_draw(self):
        self.clear()
        self.track.draw()
        for car in self.cars:
            car.draw(show_sensors=self.show_sensors)

        self.txt_round.text = f"Torneo - Ronda: {self.current_round}/{self.max_rounds} (Seed: {100 + self.current_round - 1})"
        self.txt_round.draw()
        self.txt_keys.draw()

        # Scoreboard
        for i in range(self.cars_count):
            y_pos = HEIGHT - 110 - i * 25
            arcade.draw_circle_filled(35, y_pos + 8, 8, COLORS[i % len(COLORS)])
            arcade.draw_text(f"Victorias: {self.scores[i]}", 55, y_pos, arcade.color.WHITE, 14)

    def on_key_press(self, key, modifiers):
        if key == arcade.key.G:
            self.show_sensors = not self.show_sensors
        elif key == arcade.key.R:
            # Forzar reinicio de ronda
            self.track.generate(seed=100 + self.current_round - 1)
            self.cars = self._spawn_cars()

def main():
    window = TournamentWindow()
    arcade.run()

if __name__ == "__main__":
    main()
