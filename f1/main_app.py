# main_app.py — Motor de entrenamiento con Arcade + TensorFlow + Checkpoints CSV
import arcade
import arcade.gui
import os
import csv
import math
import random
import json
from config import WIDTH, HEIGHT, FPS, NUM_CARS
from track import Track
from car import Car
from brain import Brain
from hud import draw_neural_net, draw_graph

WEIGHTS_PATH = "f1_best_brain.weights.h5"
CSV_PATH = "training_log.csv"
MAX_FRAMES = 1200


class F1TrainingWindow(arcade.Window):
    def __init__(self):
        super().__init__(WIDTH, HEIGHT, "F1 Racing ML — Arcade + TensorFlow + UI", update_rate=1 / FPS, resizable=False)
        arcade.set_background_color((30, 30, 30))

        # Estados de Simulación
        self.paused = False
        self.fast_forward = False
        self.show_brain_expanded = False

        # Configurar Interfaz de Usuario
        self.manager = arcade.gui.UIManager()
        self.manager.enable()

        # Layout horizontal en la parte inferior para que no estorbe
        h_box = arcade.gui.UIBoxLayout(vertical=False, space_between=10)

        self.btn_pause = arcade.gui.UIFlatButton(text="Pausar", width=120)
        @self.btn_pause.event("on_click")
        def on_click_pause(event):
            self.paused = not self.paused
            self.btn_pause.text = "Reanudar" if self.paused else "Pausar"

        self.btn_fast = arcade.gui.UIFlatButton(text="Acelerar", width=120)
        @self.btn_fast.event("on_click")
        def on_click_fast(event):
            self.fast_forward = not self.fast_forward
            self.btn_fast.text = "Normal" if self.fast_forward else "Acelerar"

        self.btn_brain = arcade.gui.UIFlatButton(text="Análisis Cerebral", width=150)
        @self.btn_brain.event("on_click")
        def on_click_brain(event):
            self.show_brain_expanded = not self.show_brain_expanded
            self.btn_brain.text = "Cerrar Análisis" if self.show_brain_expanded else "Análisis Cerebral"

        btn_close = arcade.gui.UIFlatButton(text="Cerrar", width=100)
        @btn_close.event("on_click")
        def on_click_close(event):
            arcade.exit()

        h_box.add(self.btn_pause)
        h_box.add(self.btn_fast)
        h_box.add(self.btn_brain)
        h_box.add(btn_close)

        anchor = arcade.gui.UIAnchorLayout()
        anchor.add(child=h_box, anchor_x="center", anchor_y="bottom", align_y=20)
        self.manager.add(anchor)

        # Cargar checkpoint o empezar desde 0
        self.generation, self.all_time_best, self.global_history, saved_weights = self._load_checkpoint()

        # Generar pista con semilla atada al número de generación (100 semillas fijas 0-99)
        track_seed = (self.generation - 1) % 100
        self.track = Track(seed=track_seed)
        
        self.cars = []
        for _ in range(NUM_CARS):
            b = Brain(saved_weights) if saved_weights else Brain()
            if saved_weights:
                b.mutate()
            self.cars.append(Car(self.track, b))

        self.show_sensors = True
        self.frame_counter = 0
        self.best_lap_time = float('inf')
        self.gen_best_lap = float('inf')
        self.event_timer = FPS * 5
        self._alive_count = 0
        self._best_car = self.cars[0]

        # Textos pre-cacheados (Estilo Técnico)
        self.txt_gen = arcade.Text("", 20, HEIGHT - 30, arcade.color.WHITE, 16, font_name="Arial")
        self.txt_lap = arcade.Text("", 20, HEIGHT - 55, arcade.color.ELECTRIC_BLUE, 12)
        self.txt_keys = arcade.Text("", 20, HEIGHT - 75, arcade.color.GRAY, 11)

    # ── Checkpoints y Dataset no-relacional ─────────────────
    def _load_checkpoint(self):
        generation = 1
        all_time_best = 0
        history = []

        if os.path.exists(CSV_PATH):
            with open(CSV_PATH, 'r') as f:
                for row in csv.DictReader(f):
                    try:
                        gen = int(row['generation'])
                        best = float(row['best_fitness'])
                        generation = gen + 1
                        all_time_best = max(all_time_best, best)
                        history.append(best)
                    except: continue
            history = history[-100:]
            print(f"📂 Checkpoint: Reanudando Gen {generation}")

        weights = None
        if os.path.exists(WEIGHTS_PATH):
            try:
                loader = Brain()
                loader.model.load_weights(WEIGHTS_PATH)
                weights = loader.get_weights()
            except Exception as e:
                pass

        return generation, all_time_best, history, weights

    def _save_checkpoint(self, best_fitness, avg_progress, best_brain):
        # Guardar binario general para carga rápida
        best_brain.model.save_weights(WEIGHTS_PATH)
        
        # Dataset Explicativo para Jupyter
        write_header = not os.path.exists(CSV_PATH)
        weights_list = [w.tolist() for w in best_brain.get_weights()]
        weights_json = json.dumps(weights_list)
        
        with open(CSV_PATH, 'a', newline='') as f:
            w = csv.writer(f)
            if write_header:
                w.writerow(['generation', 'best_fitness', 'avg_progress', 'seed', 'best_lap', 'weights_json'])
            
            lap_val = f"{self.gen_best_lap/60:.2f}" if self.gen_best_lap < float('inf') else "null"
            w.writerow([
                self.generation, 
                f"{best_fitness:.2f}", 
                f"{avg_progress:.2f}", 
                (self.generation - 1) % 100, 
                lap_val,
                weights_json
            ])

    # ── Lógica ───────────────────────────────────────────
    def _do_update_step(self):
        alive_count = 0
        best_car = self.cars[0]
        self.frame_counter += 1

        for car in self.cars:
            car.update()
            if car.alive and not car.finished:
                alive_count += 1
            if car.score > best_car.score:
                best_car = car
            if car.finished:
                self.gen_best_lap = min(self.gen_best_lap, car.lap_time)
                self.best_lap_time = min(self.best_lap_time, car.lap_time)

        self._alive_count = alive_count
        self._best_car = best_car

        # Fin de generación
        if alive_count == 0 or self.frame_counter >= MAX_FRAMES:
            self.cars.sort(key=lambda c: c.score, reverse=True)
            best_car = self.cars[0]

            avg_prog = sum(c.total_progress for c in self.cars) / len(self.cars)
            best_fit = best_car.score
            self.all_time_best = max(self.all_time_best, best_fit)
            self.global_history.append(best_fit)
            if len(self.global_history) > 100:
                self.global_history.pop(0)

            self._save_checkpoint(best_fit, avg_prog, best_car.brain)

            # Selección Top 20%
            top_count = max(1, math.ceil(NUM_CARS / 5))
            top_cars = self.cars[:top_count]

            self.generation += 1
            
            # Nueva pista aleatoria con Seed (0-99)
            track_seed = (self.generation - 1) % 100
            self.track.generate(seed=track_seed)

            new_cars = []
            for _ in range(NUM_CARS):
                parent = random.choice(top_cars)
                child = Brain(parent.brain.get_weights())
                child.mutate()
                new_cars.append(Car(self.track, child))

            self.cars = new_cars
            self.frame_counter = 0
            self.gen_best_lap = float('inf')
            self.event_timer = FPS * 5

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

    def on_update(self, delta_time):
        if self.paused:
            return

        iterations = 10 if self.fast_forward else 1
        for _ in range(iterations):
            self._do_update_step()

    # ── Renderizado ──────────────────────────────────────
    def on_draw(self):
        self.clear()

        if self.show_brain_expanded:
            self._draw_expanded_brain()
            self.manager.draw()
            return

        # Renderizado Normal
        self.track.draw()
        for car in self.cars:
            car.draw(show_sensors=self.show_sensors)

        # HUD Texto Académico
        alive = self._alive_count
        best = self._best_car
        self.txt_gen.text = f"GEN: {self.generation:03} | SEED: {(self.generation-1)%100:02} | POBLACIÓN: {alive}/{NUM_CARS}"
        self.txt_gen.draw()

        lap_str = f"{self.best_lap_time / 60:.2f}s" if self.best_lap_time < float('inf') else "N/A"
        gen_lap = f"{self.gen_best_lap / 60:.2f}s" if self.gen_best_lap < float('inf') else "N/A"
        self.txt_lap.text = f"RECORD GLOBAL: {lap_str} | MEJOR GEN: {gen_lap} | SCORE MÁX: {self.all_time_best:,.0f}"
        self.txt_lap.draw()

        ticks_left = MAX_FRAMES - self.frame_counter
        self.txt_keys.text = f"TTL: {ticks_left} ticks | 'R' Reiniciar Pesos | 'G' Alternar Sensores"
        self.txt_keys.draw()

        # Mini-HUD Red Neuronal (Esquina inferior izquierda)
        if best:
            draw_neural_net(best.brain, best.sensors,
                            getattr(best, 'last_output', [0, 0]),
                            20, 20, 220, 240)

        # Gráfico de Evolución (Esquina inferior derecha)
        draw_graph(self.global_history, WIDTH - 280, 20, 260, 200)
        
        self.manager.draw()
        
    def _draw_expanded_brain(self):
        """Visualización Académica de la Arquitectura de Inferencia"""
        arcade.draw_rectangle_filled(WIDTH/2, HEIGHT/2, WIDTH, HEIGHT, (15, 17, 23))
        best = self._best_car
        if not best: return
        
        # Red Principal
        draw_neural_net(best.brain, best.sensors,
                        getattr(best, 'last_output', [0, 0]),
                        WIDTH // 4, HEIGHT // 5, WIDTH // 2, HEIGHT * 0.6)
                        
        # Textos de Análisis
        arcade.draw_text("TOPOLOGÍA DE RED NEURONAL DENSAMENTE CONECTADA", WIDTH/2, HEIGHT - 60, 
                         arcade.color.ELECTRIC_CYAN, 24, anchor_x="center", bold=True, font_name="Arial")
        
        arcade.draw_text("Flujo de Información: Percepción -> Procesamiento Oculto -> Actuación Final",
                         WIDTH/2, HEIGHT - 95, arcade.color.LIGHT_SKY_BLUE, 14, anchor_x="center", italic=True)

        # Glosario y Explicación
        desc_box_y = 120
        arcade.draw_lrtb_rectangle_outline(WIDTH/2 - 400, WIDTH/2 + 400, desc_box_y + 80, desc_box_y - 20, arcade.color.DARK_SLATE_GRAY)
        
        arcade.draw_text("EXPLICACIÓN TÉCNICA:", WIDTH/2 - 380, desc_box_y + 50, arcade.color.GOLD, 12, bold=True)
        explanation = (
            "- Capa de Entrada: 5 Sensores Raycast detectan la distancia a los bordes de la pista.\n"
            "- Sinapsis (Líneas): El grosor representa el valor del peso. El color indica si la señal es excitatoria (Verde) o inhibitoria (Rojo).\n"
            "- Funciones de Activación: Se utiliza ReLu/Tanh para introducir no-linealidad en la toma de decisiones.\n"
            "- Capa de Salida: Determina el ángulo de giro (Steering) y el par motor (Acceleration)."
        )
        arcade.draw_text(explanation, WIDTH/2 - 380, desc_box_y + 35, arcade.color.WHITE, 11, multiline=True, width=760)

        # Etiquetas de Capa (Inputs)
        sensor_names = ["EXTERNO IZQ", "INTERNO IZQ", "FRONTAL", "INTERNO DER", "EXTERNO DER"]
        for i, name in enumerate(sensor_names):
            y_pos = HEIGHT // 5 + 35 + (i / 4) * (HEIGHT * 0.6 - 70)
            arcade.draw_text(name, WIDTH // 4 - 15, y_pos, arcade.color.AQUA, 10, anchor_x="right", anchor_y="center")

        # Etiquetas de Capa (Outputs)
        output_names = ["GIRO (DIRECCIÓN)", "GAS (ACELERACIÓN)"]
        for i, name in enumerate(output_names):
            y_pos = HEIGHT // 5 + 35 + 40 + (i / 1) * (HEIGHT * 0.6 - 150)
            arcade.draw_text(name, WIDTH * 3/4 + 15, y_pos, arcade.color.ORANGE_PEEL, 10, anchor_x="left", anchor_y="center")

        arcade.draw_text("Verde: Conexión Positiva (Excitatoria) | Rojo: Conexión Negativa (Inhibitoria) | Grosor: Intensidad Sináptica",
                         WIDTH/2, 50, arcade.color.YELLOW, 12, anchor_x="center")

    # ── Input ────────────────────────────────────────────
    def on_key_press(self, key, modifiers):
        if key == arcade.key.R:
            self.generation = 1
            self.track.generate(seed=0)
            self.cars = [Car(self.track) for _ in range(NUM_CARS)]
            self.global_history = []
            self.all_time_best = 0
            if os.path.exists(CSV_PATH): os.remove(CSV_PATH)
            if os.path.exists(WEIGHTS_PATH): os.remove(WEIGHTS_PATH)
        elif key == arcade.key.G:
            self.show_sensors = not self.show_sensors


def main():
    window = F1TrainingWindow()
    arcade.run()


if __name__ == "__main__":
    main()
