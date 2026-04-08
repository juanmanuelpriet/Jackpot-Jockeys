# hud.py — Visualización HUD con Arcade 3.x
import arcade

def draw_neural_net(brain, sensors, output, x, y, w, h):
    """Dibuja la red neuronal. x,y = esquina inferior-izquierda (coords Arcade)."""
    # Panel de fondo
    arcade.draw_lrbt_rectangle_filled(x, x + w, y, y + h, (10, 14, 26, 200))
    arcade.draw_lrbt_rectangle_outline(x, x + w, y, y + h, (60, 130, 200, 100), 1)

    weights = brain.get_weights()
    w1, w2, w3, w4 = weights[0], weights[2], weights[4], weights[6]

    layers = [5, 5, 3, 3, 2]
    pad_x, pad_y = 28, 32
    layer_pos = []

    for li, count in enumerate(layers):
        lx = x + pad_x + (li / (len(layers) - 1)) * (w - pad_x * 2)
        nodes = []
        for j in range(count):
            if count == 1:
                ly = y + h / 2
            elif count == 2:
                ly = y + pad_y + 30 + (j / 1) * (h - pad_y * 2 - 60)
            elif count == 3:
                ly = y + pad_y + 15 + (j / 2) * (h - pad_y * 2 - 30)
            else:
                ly = y + pad_y + (j / max(1, count - 1)) * (h - pad_y * 2)
            nodes.append((lx, ly))
        layer_pos.append(nodes)

    # Conexiones
    matrices = [w1, w2, w3, w4]
    for m_idx, w_mat in enumerate(matrices):
        for i in range(len(layer_pos[m_idx])):
            for j in range(len(layer_pos[m_idx + 1])):
                wt = w_mat[i][j]
                intensity = min(abs(wt) * 80, 255)
                color = (80, 255, 140, int(intensity)) if wt > 0 else (255, 80, 80, int(intensity))
                arcade.draw_line(layer_pos[m_idx][i][0], layer_pos[m_idx][i][1],
                                 layer_pos[m_idx + 1][j][0], layer_pos[m_idx + 1][j][1], color, 1)

    # Nodos
    for li, nodes in enumerate(layer_pos):
        for j, pos in enumerate(nodes):
            val = 0
            if li == 0 and sensors is not None:
                val = sensors[j]
            elif li == len(layer_pos) - 1 and output is not None:
                val = output[j]

            if val > 0:
                color = (min(255, 80 + int(val * 175)), 255, 140)
            elif val < 0:
                color = (255, min(255, 80 + int(abs(val) * 175)), 80)
            else:
                color = (150, 150, 150)
            arcade.draw_circle_filled(pos[0], pos[1], 6, color)


def draw_graph(history, x, y, w, h):
    """Dibuja gráfico de progreso. x,y = esquina inferior-izquierda (coords Arcade)."""
    # Panel de fondo
    arcade.draw_lrbt_rectangle_filled(x, x + w, y, y + h, (10, 14, 26, 220))
    arcade.draw_lrbt_rectangle_outline(x, x + w, y, y + h, (100, 200, 255, 120), 1)

    if len(history) < 1:
        return

    pad = 25
    px_w, px_h = w - pad * 2, h - pad * 2 - 10
    max_score = max(max(history), 1)

    points = []
    
    # Si solo hay 1 punto, dibujamos solo un círculo
    if len(history) == 1:
        px = x + w // 2
        py = y + pad + (history[0] / max_score) * px_h
        arcade.draw_circle_filled(px, py, 4, (80, 255, 140))
        return

    # Si hay más de 1 punto, dibujamos la línea
    for i, score in enumerate(history):
        px = x + pad + (i / (len(history) - 1)) * px_w
        py = y + pad + (score / max_score) * px_h
        points.append((px, py))

    arcade.draw_line_strip(points, (0, 255, 180, 200), 2)
    for px, py in points:
        arcade.draw_circle_filled(px, py, 3, (150, 255, 200))
