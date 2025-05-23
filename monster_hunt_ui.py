import sys, time, random
import pygame as pg

try:
    import SimpleBFS as mh  
except ModuleNotFoundError:
    print("Could not find it in the same directory.")
    sys.exit(1)


CELL        = 48      
MARGIN      = 2       
STEP_MS     = 300     

BG_COLOR    = (250, 250, 250)   
GRID_COLOR  = (210, 210, 210)   
AGENT_FILL  = (0, 115, 230)     
AGENT_TXT   = (15, 15, 20)  
HUD_TEXT    = (15, 15, 20)      
MON_TXT     = (15, 15, 20)      

MONSTER_COLORS = [
    ( 64, 224, 208),   
    (  0, 206, 209),   
    ( 72, 209, 204),   
    (  0, 191, 255),   
    (135, 206, 250),   
    (152, 251, 152),   
    ( 60, 179, 113),   
    (124, 252,   0),   
    (255, 255,   0),   
    (255, 215,   0),   
    (255, 165,   0),   
    (255, 140,   0),   
    (255,  99,  71),   
    (255,  69,   0),   
    (255,  20, 147),   
    (219, 112, 147),   
    (199,  21, 133),   
    (186,  85, 211),   
    (147, 112, 219),   
    (138,  43, 226),   
    ( 72,  61, 139),   
    ( 65, 105, 225),   
    ( 30, 144, 255),   
    (100, 149, 237),   
    (176, 196, 222),   
]

ARROW = {mh.DIRECTION_VECTORS["N"]: "^", mh.DIRECTION_VECTORS["S"]: "v", mh.DIRECTION_VECTORS["W"]: "<", mh.DIRECTION_VECTORS["E"]: ">"}

def new_env():
    seed = int(time.time() * 1000) % 1_000_000
    return mh.Environment(R=8, C=8, n_monsters=6)


def draw_board(screen: pg.Surface, env: mh.Environment, font: pg.font.Font):
    screen.fill(BG_COLOR)
    R, C = env.R, env.C

    
    for r in range(R):
        for c in range(C):
            rect = pg.Rect(c * CELL + MARGIN, r * CELL + MARGIN,
                           CELL - 2 * MARGIN, CELL - 2 * MARGIN)
            pg.draw.rect(screen, GRID_COLOR, rect, 1)

    
    for (mr, mc), mon in env.monsters.items():
        idx = min(mon.level - 1, len(MONSTER_COLORS) - 1)
        colour = MONSTER_COLORS[idx]
        rect = pg.Rect(mc * CELL + MARGIN, mr * CELL + MARGIN,
                       CELL - 2 * MARGIN, CELL - 2 * MARGIN)
        pg.draw.rect(screen, colour, rect)
        label = font.render(f"{mon.level}{mh.DIRECTION_ARROWS[mon.facing]}", True, MON_TXT)
        screen.blit(label, label.get_rect(center=rect.center))

    
    ar, ac = env.agent.r, env.agent.c
    rect = pg.Rect(ac * CELL + MARGIN, ar * CELL + MARGIN,
                   CELL - 2 * MARGIN, CELL - 2 * MARGIN)
    pg.draw.rect(screen, AGENT_FILL, rect)
    label = font.render("A", True, AGENT_TXT)
    screen.blit(label, label.get_rect(center=rect.center))

    
    hud_top = R * CELL + 8
    hud_lines = [
        f"Turn: {env.turn}",
        f"Agent level: {env.agent.level}",
        f"Kills: {env.agent.kills}",
        f"Monsters left: {len(env.monsters)}",
        "SPACE=pause  N=step  R=reset  ESC=quit",
    ]
    for i, txt in enumerate(hud_lines):
        s = font.render(txt, True, HUD_TEXT)
        screen.blit(s, (8, hud_top + i * (font.get_height() + 2)))



def main():
    pg.init()
    pg.display.set_caption("Monster Hunt")
    font = pg.font.SysFont("NONE", int(CELL * 0.45))

    env = new_env()
    width, height = env.C * CELL, env.R * CELL + 110
    screen = pg.display.set_mode((width, height))
    clock = pg.time.Clock()

    paused = False
    last_step = pg.time.get_ticks()

    running = True
    while running:
        
        for ev in pg.event.get():
            if ev.type == pg.QUIT:
                running = False
            elif ev.type == pg.KEYDOWN:
                if ev.key in (pg.K_ESCAPE, pg.K_q):
                    running = False
                elif ev.key == pg.K_SPACE:
                    paused = not paused
                elif ev.key == pg.K_n and paused:
                    env.step()
                elif ev.key == pg.K_r:
                    env = new_env(); paused = False

        now = pg.time.get_ticks()
        if not paused and now - last_step >= STEP_MS:
            if env.agent.alive and env.monsters:
                env.step()
            last_step = now

        draw_board(screen, env, font)
        game_over = (not env.agent.alive) or (not env.monsters)

        if game_over:
            msg = "You won!" if env.agent.alive else "Agent died"
            big = pg.font.SysFont(None, int(CELL * 0.7))
            surf = big.render(msg, True, HUD_TEXT)
            screen.blit(surf, surf.get_rect(center=(width // 2, height // 2)))

        pg.display.flip()
        clock.tick(60)  
    pg.quit()


if __name__ == "__main__":
    main()
