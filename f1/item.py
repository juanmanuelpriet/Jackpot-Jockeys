import pygame
import random
import math
from config import FPS

class ItemType:
    BOOST = 0
    BLIND = 1
    FREEZE_LEADER = 2
    TRAP = 3

class Item:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.radius = 12
        self.active = True
        self.type = random.choice([ItemType.BOOST, ItemType.BLIND, ItemType.FREEZE_LEADER, ItemType.TRAP])
        self.color = (255, 215, 0) if self.type != ItemType.TRAP else (200, 50, 50)
        self.angle = random.uniform(0, math.pi)

    def draw(self, screen):
        if not self.active: return
        self.angle += 0.05
        
        box_surf = pygame.Surface((24, 24), pygame.SRCALPHA)
        pygame.draw.rect(box_surf, self.color, (0, 0, 24, 24), border_radius=4)
        
        # Resaltado para ítems buenos
        if self.type != ItemType.TRAP:
            pygame.draw.rect(box_surf, (255, 255, 255), (0, 0, 24, 24), 2, border_radius=4)
            # Dibujar un peque de interrogación
            font = pygame.font.SysFont("Arial", 16, bold=True)
            text = font.render("?", True, (255, 255, 255))
            box_surf.blit(text, (24//2 - text.get_width()//2, 24//2 - text.get_height()//2))
            
        rotated = pygame.transform.rotate(box_surf, math.degrees(self.angle))
        rect = rotated.get_rect(center=(int(self.x), int(self.y)))
        screen.blit(rotated, rect)

    def apply(self, collector_car, all_cars):
        if self.type == ItemType.BOOST:
            collector_car.boost_timer = FPS * 2
        elif self.type == ItemType.BLIND:
            for car in all_cars:
                if car != collector_car and car.alive:
                    car.blind_timer = int(FPS * 1.5)
        elif self.type == ItemType.FREEZE_LEADER:
            best = None
            best_score = -99999
            for car in all_cars:
                if car.alive and car != collector_car and car.score > best_score:
                    best_score = car.score
                    best = car
            if best:
                best.frozen_timer = int(FPS * 1.5)
        elif self.type == ItemType.TRAP:
            collector_car.frozen_timer = int(FPS * 1.5)
