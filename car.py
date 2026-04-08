# car.py — Renderizado con Arcade, Fitness idéntico al JS, TensorFlow Brain
import arcade
import math
import random
from config import COLORS, NUM_SENSORS, SENSOR_LENGTH, HEIGHT
from brain import Brain

def SY(y):
    return HEIGHT - y

class Car:
    def __init__(self, track, brain=None):
        self.track = track
        self.alive = True
        self.brain = brain if brain else Brain()
        self.color = random.choice(COLORS)
        self.sensors = [1.0] * NUM_SENSORS
        self.last_output = [0, 0]

        self.x, self.y = track.path_points[0]
        p2 = track.path_points[1]
        self.angle = math.atan2(p2[1] - self.y, p2[0] - self.x)
        self.speed = 0

        # Fitness (idéntico a sketch.js)
        self.max_progress = track.get_progress(self.x, self.y)
        self.last_progress = self.max_progress
        self.total_progress = 0
        self.stuck_frames = 0
        self.lap_time = 0
        self.finished = False
        self.score = 0
        self.laps = 0

        self.frozen_timer = 0
        self.blind_timer = 0
        self.boost_timer = 0

    def update(self):
        if not self.alive or self.finished:
            return
        self.lap_time += 1

        if self.frozen_timer > 0:
            self.frozen_timer -= 1
            self.speed = 0
            return

        is_blind = self.blind_timer > 0
        if is_blind: self.blind_timer -= 1
        is_boosted = self.boost_timer > 0
        if is_boosted: self.boost_timer -= 1

        sensor_angles = [-math.pi / 2.5, -math.pi / 5, 0, math.pi / 5, math.pi / 2.5]
        self.sensors = []
        for sa in sensor_angles:
            if is_blind:
                self.sensors.append(random.uniform(0.0, 0.3))
            else:
                dist = self.track.get_cast_ray(self.x, self.y, self.angle + sa)
                self.sensors.append(dist / SENSOR_LENGTH)

        output = self.brain.predict(self.sensors)
        steer, gas = float(output[0]), float(output[1])
        self.last_output = [steer, gas]

        self.angle += steer * 0.08
        self.speed = (3 + (gas + 1) * 3)
        if is_boosted:
            self.speed *= 1.5

        self.x += math.cos(self.angle) * self.speed
        self.y += math.sin(self.angle) * self.speed

        if not self.track.is_on_track(self.x, self.y):
            self.alive = False
            return

        n = len(self.track.path_points)
        progress = self.track.get_progress(self.x, self.y, self.last_progress)
        self.last_progress = progress
        diff = (progress - self.max_progress + n) % n
        if diff > 0 and diff < n * 0.5:
            self.max_progress = progress
            self.total_progress += diff
            self.stuck_frames = 0
            if self.total_progress >= n:
                self.finished = True
                self.laps = 1
                self.score = self.total_progress + (10000 / self.lap_time)
                return
        else:
            self.stuck_frames += 1
            if self.stuck_frames > 300:
                self.alive = False
        self.score = self.total_progress

    def _rot(self, lx, ly):
        """Rota un punto local y lo traduce a coordenadas de pantalla Arcade."""
        cos_a = math.cos(self.angle)
        sin_a = math.sin(self.angle)
        wx = lx * cos_a - ly * sin_a + self.x
        wy = lx * sin_a + ly * cos_a + self.y
        return (wx, SY(wy))

    def draw(self, show_sensors=True):
        if not self.alive and not self.finished:
            return

        sx, sy = self.x, SY(self.y)

        # Sensores
        if show_sensors:
            sa_list = [-math.pi / 2.5, -math.pi / 5, 0, math.pi / 5, math.pi / 2.5]
            for i, sv in enumerate(self.sensors):
                if sv < 1.0:
                    a = self.angle + sa_list[i]
                    d = sv * SENSOR_LENGTH
                    ex = self.x + math.cos(a) * d
                    ey = self.y + math.sin(a) * d
                    arcade.draw_line(sx, sy, ex, SY(ey), (50, 150, 50), 1)
                    arcade.draw_circle_filled(ex, SY(ey), 3, (200, 0, 0))

        # Aura FX
        if self.frozen_timer > 0:
            arcade.draw_circle_outline(sx, sy, 14, (100, 200, 255), 2)
        elif self.boost_timer > 0:
            arcade.draw_circle_outline(sx, sy, 16, (255, 100, 50), 1)

        # Sombra
        arcade.draw_ellipse_filled(sx, sy - 4, 28, 16, (20, 20, 20, 100))

        # F1 Car body (polígono rotado)
        body = [
            self._rot(14, 0),      # punta
            self._rot(6, -5),
            self._rot(-10, -5),
            self._rot(-14, -3),
            self._rot(-14, 3),
            self._rot(-10, 5),
            self._rot(6, 5),
        ]
        arcade.draw_polygon_filled(body, self.color)

        # Alerón frontal
        fw = [self._rot(14, -6), self._rot(16, -6), self._rot(16, 6), self._rot(14, 6)]
        arcade.draw_polygon_filled(fw, (200, 200, 200))

        # Alerón trasero
        rw = [self._rot(-14, -7), self._rot(-12, -7), self._rot(-12, 7), self._rot(-14, 7)]
        arcade.draw_polygon_filled(rw, (60, 60, 60))

        # Ruedas
        for wx, wy in [(-9, -7), (-9, 7), (5, -6), (5, 6)]:
            wh = [self._rot(wx - 4, wy - 2), self._rot(wx + 4, wy - 2),
                  self._rot(wx + 4, wy + 2), self._rot(wx - 4, wy + 2)]
            arcade.draw_polygon_filled(wh, (15, 15, 15))

        # Cockpit
        cp = self._rot(0, 0)
        arcade.draw_circle_filled(cp[0], cp[1], 4, (0, 0, 0))
        vr = self._rot(1, 0)
        arcade.draw_circle_filled(vr[0], vr[1], 2, (255, 100, 0))
