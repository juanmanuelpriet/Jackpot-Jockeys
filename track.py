# track.py — Renderizado con Arcade, lógica intacta
import arcade
from arcade.shape_list import ShapeElementList, create_line, create_polygon
import random
import math
from config import WIDTH, HEIGHT, SENSOR_LENGTH

def SY(y):
    """Convierte coordenada Y del mundo (y-abajo) a pantalla Arcade (y-arriba)."""
    return HEIGHT - y

def intersect(A, B, C, D):
    """Retorna True si el segmento AB intersecta al segmento CD."""
    def ccw(A, B, C):
        return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0])
    return ccw(A, C, D) != ccw(B, C, D) and ccw(A, B, C) != ccw(A, B, D)

class Track:
    def __init__(self, seed=None):
        self.shape_list = None
        self.seed = seed
        self.generate(self.seed)

    def _catmull_rom_spline(self, P0, P1, P2, P3, num_points=10):
        points = []
        for i in range(num_points):
            t = i / num_points
            t2 = t * t
            t3 = t2 * t
            x = 0.5 * ((2 * P1[0]) +
                       (-P0[0] + P2[0]) * t +
                       (2 * P0[0] - 5 * P1[0] + 4 * P2[0] - P3[0]) * t2 +
                       (-P0[0] + 3 * P1[0] - 3 * P2[0] + P3[0]) * t3)
            y = 0.5 * ((2 * P1[1]) +
                       (-P0[1] + P2[1]) * t +
                       (2 * P0[1] - 5 * P1[1] + 4 * P2[1] - P3[1]) * t2 +
                       (-P0[1] + 3 * P1[1] - 3 * P2[1] + P3[1]) * t3)
            points.append((x, y))
        return points

    def generate(self, seed=None):
        cx, cy = WIDTH // 2, HEIGHT // 2
        
        # Guardamos la semilla original para incrementarla en caso de fallo
        current_seed = seed
        
        while True:
            # Instancia local para no afectar el resto de la simulación
            rng = random.Random(current_seed)
            
            # 1. Distribución Angular No Uniforme (Muestreo Estocástico)
            N = rng.randint(12, 18)
            angle_steps = []
            for _ in range(N):
                # Variabilidad en los pasos para crear rectas largas y curvas cerradas
                angle_steps.append(rng.uniform(0.1, 1.2))
                
            total_step = sum(angle_steps)
            
            theta_list = []
            acc = 0
            for step in angle_steps:
                theta_list.append(acc)
                acc += (step / total_step) * 2 * math.pi
                
            # 2. Ruido Fractal (fBm) mediante Superposición de Octavas
            octaves = 3
            # Amplitud decreciente
            amplitudes = [min(WIDTH, HEIGHT) * 0.15 * (0.5 ** i) for i in range(octaves)]
            # Frecuencias estrictamente enteras para asegurar empalme periódico en 2*PI
            frequencies = [rng.randint(1, 3) * (2 ** i) for i in range(octaves)]
            # Fase estocástica constante para todo el circuito
            phases = [rng.uniform(0, 2 * math.pi) for _ in range(octaves)]
            
            base_radius = min(WIDTH, HEIGHT) * 0.32
            
            base_points = []
            for theta in theta_list:
                r_offset = 0
                for i in range(octaves):
                    r_offset += amplitudes[i] * math.sin(frequencies[i] * theta + phases[i])
                
                r = base_radius + r_offset
                
                # Escala anamórfica para ajustarse a resoluciones apaisadas (anchas)
                px = cx + (r * 1.35) * math.cos(theta)
                py = cy + (r * 0.85) * math.sin(theta)
                
                # Muro limitante (Padding)
                px = max(80, min(WIDTH - 80, px))
                py = max(80, min(HEIGHT - 80, py))
                
                base_points.append((px, py))
                
            self.path_points = []
            M = len(base_points)
            for i in range(M):
                P0 = base_points[(i - 1) % M]
                P1 = base_points[i]
                P2 = base_points[(i + 1) % M]
                P3 = base_points[(i + 2) % M]
                # Interpolación Catmull-Rom
                seg = self._catmull_rom_spline(P0, P1, P2, P3, num_points=25)
                self.path_points.extend(seg)

            # Validar que la pista no se cruce a sí misma
            if not self._is_self_intersecting(self.path_points):
                break
            
            # Si falla, probamos con otra semilla derivada
            if current_seed is None:
                current_seed = random.randint(0, 999999)
            else:
                current_seed += 1

        self.width = 50
        self.inner_border = []
        self.outer_border = []

        n_pts = len(self.path_points)
        for i in range(n_pts):
            prev_p = self.path_points[(i - 1) % n_pts]
            next_p = self.path_points[(i + 1) % n_pts]
            curr_p = self.path_points[i]
            dx = next_p[0] - prev_p[0]
            dy = next_p[1] - prev_p[1]
            length = math.hypot(dx, dy)
            if length == 0: length = 1
            nx, ny = -dy / length, dx / length
            self.inner_border.append((curr_p[0] - nx * self.width, curr_p[1] - ny * self.width))
            self.outer_border.append((curr_p[0] + nx * self.width, curr_p[1] + ny * self.width))

        self._build_shapes()

    def _is_self_intersecting(self, points):
        """Detecta si un polígono se intersecta a sí mismo (fuerza bruta simplificada)."""
        n = len(points)
        # Solo comprobamos cada 5 puntos para optimizar la generación
        step = 5
        for i in range(0, n - step, step):
            p1, p2 = points[i], points[i + step]
            for j in range(i + step * 2, n, step):
                # No comparar el último segmento con el primero directamente aquí
                if (j + step) % n == i: continue
                
                p3, p4 = points[j], points[(j + step) % n]
                if intersect(p1, p2, p3, p4):
                    return True
        return False

    def _build_shapes(self):
        """Pre-construye las formas de la pista como ShapeElementList (1 draw call)."""
        self.shape_list = ShapeElementList()
        n = len(self.path_points)

        # Superficie de la pista: cuadrilateros exactos entre bordes
        for i in range(n):
            j = (i + 1) % n
            
            ix1, iy1 = self.inner_border[i]
            ix2, iy2 = self.inner_border[j]
            ox1, oy1 = self.outer_border[i]
            ox2, oy2 = self.outer_border[j]
            
            points = [
                (ix1, SY(iy1)),
                (ix2, SY(iy2)),
                (ox2, SY(oy2)),
                (ox1, SY(oy1))
            ]
            
            quad = create_polygon(points, (50, 55, 65))
            self.shape_list.append(quad)

        # Bordes con curbs
        curb_len = 4
        for i in range(n):
            j = (i + 1) % n
            color = (200, 0, 0) if (i // curb_len) % 2 == 0 else (255, 255, 255)
            ix1, iy1 = self.inner_border[i]
            ix2, iy2 = self.inner_border[j]
            self.shape_list.append(create_line(ix1, SY(iy1), ix2, SY(iy2), color, 2))
            ox1, oy1 = self.outer_border[i]
            ox2, oy2 = self.outer_border[j]
            self.shape_list.append(create_line(ox1, SY(oy1), ox2, SY(oy2), color, 2))

    def draw(self):
        if self.shape_list:
            self.shape_list.draw()
        # Línea de meta (encima del batch)
        if len(self.inner_border) > 0:
            ix, iy = self.inner_border[0]
            ox, oy = self.outer_border[0]
            arcade.draw_line(ix, SY(iy), ox, SY(oy), arcade.color.WHITE, 6)

    def is_on_track(self, x, y):
        min_dist = float('inf')
        for p in self.path_points:
            d = math.hypot(x - p[0], y - p[1])
            if d < min_dist:
                min_dist = d
        return min_dist < self.width

    def get_progress(self, x, y, last_progress=None):
        n = len(self.path_points)
        search_range = max(1, int(n * 0.15))
        closest_idx = last_progress if last_progress is not None else 0
        closest_dist = float('inf')
        if last_progress is not None:
            for offset in range(-search_range, search_range + 1):
                i = (last_progress + offset) % n
                p = self.path_points[i]
                d = math.hypot(x - p[0], y - p[1])
                if d < closest_dist:
                    closest_dist = d
                    closest_idx = i
        else:
            for i in range(n):
                p = self.path_points[i]
                d = math.hypot(x - p[0], y - p[1])
                if d < closest_dist:
                    closest_dist = d
                    closest_idx = i
        return closest_idx

    def get_cast_ray(self, x, y, angle):
        for d in range(0, SENSOR_LENGTH, 5):
            tx = x + math.cos(angle) * d
            ty = y + math.sin(angle) * d
            if not self.is_on_track(tx, ty):
                return d
        return SENSOR_LENGTH
