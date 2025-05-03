import random
import os
import time


DIRECTIONS = ["N", "S", "W", "E"]
DIRECTION_VECTORS = {
    "N": (-1, 0),
    "S": (1, 0),
    "W": (0, -1),
    "E": (0, 1)
}
DIRECTION_ARROWS = {
    "N": "^",
    "S": "v",
    "W": "<",
    "E": ">"
}

class Monster:
    def __init__(self, r, c, level):
        self.r = r
        self.c = c
        self.level = level
        self.facing = random.choice(DIRECTIONS)
        self.turns_seen = 0

    def rotate_if_needed(self):
        self.turns_seen += 1
        if self.turns_seen % 2 == 0:
            
            order = ["N", "E", "S", "W"]
            idx = order.index(self.facing)
            self.facing = order[(idx + 1) % len(order)]

class Agent:
    def __init__(self, r, c):
        self.r = r
        self.c = c
        self.level = 1
        self.kills = 0
        self.alive = True
        self.known_monsters = {}  
        self.visited = {(r, c)}          

    def perceive(self, env):
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                if dr == dc == 0:                       
                    continue
                nr, nc = self.r + dr, self.c + dc
                if 0 <= nr < env.R and 0 <= nc < env.C:
                    if (nr, nc) in env.monsters:
                        self.known_monsters[(nr, nc)] = env.monsters[(nr, nc)]

        self.known_monsters = {
            pos: m for pos, m in self.known_monsters.items() if pos in env.monsters
        }

    def find_path(self, env, goal_r, goal_c):
        """Simple path finding using BFS"""
        R, C = env.R, env.C
        start = (self.r, self.c)
        queue = [(start, [])]
        visited = {start}
        
        while queue:
            (r, c), path = queue.pop(0)
            
            if (r, c) == (goal_r, goal_c):
                return path
                
            for direction in DIRECTIONS:
                dr, dc = DIRECTION_VECTORS[direction]
                nr, nc = r + dr, c + dc
                
                if (0 <= nr < R and 0 <= nc < C and 
                    (nr, nc) not in visited and 
                    (nr, nc) not in env.get_blocked_positions() and
                    (nr, nc) not in env.get_dangerous_positions()):
                    
                    visited.add((nr, nc))
                    queue.append(((nr, nc), path + [direction]))
                    
        return []  

    def plan_action(self, env):
        
        self.perceive(env)

        
        edible = [
            (abs(mr - self.r) + abs(mc - self.c),  
             m.level,                               
             mr, mc)                                
            for (mr, mc), m in self.known_monsters.items()
            if m.level <= self.level
        ]
        edible.sort()                               

        for dist, _, mr, mc in edible:
            
            if dist == 1:
                return "ATTACK", (mr, mc)

            
            candidate_targets = []
            for dr, dc in DIRECTION_VECTORS.values():
                ar, ac = mr + dr, mc + dc
                if (
                    0 <= ar < env.R and 0 <= ac < env.C and
                    (ar, ac) not in env.get_blocked_positions()
                ):
                    candidate_targets.append((ar, ac))

            
            best_path = None
            for ar, ac in candidate_targets:
                path = self.find_path(env, ar, ac)
                if path and (best_path is None or len(path) < len(best_path)):
                    best_path = path

            if best_path:                           
                return "MOVE", best_path[0]

        
        safe_dirs = []
        for direction in DIRECTIONS:
            dr, dc = DIRECTION_VECTORS[direction]
            nr, nc = self.r + dr, self.c + dc
            if (
                0 <= nr < env.R and 0 <= nc < env.C and
                (nr, nc) not in env.get_blocked_positions() and
                (nr, nc) not in env.get_dangerous_positions()
            ):
                safe_dirs.append(direction)

        if safe_dirs:
            return "MOVE", random.choice(safe_dirs)

        return "WAIT", None

    def execute(self, env):
        self.visited.add((self.r, self.c))
        action, arg = self.plan_action(env)
        
        if action == "MOVE":
            dr, dc = DIRECTION_VECTORS[arg]
            self.r += dr
            self.c += dc
        elif action == "ATTACK":
            target_r, target_c = arg
            target_pos = None
            for pos, monster in env.monsters.items():
                if pos == (target_r, target_c):
                    target_pos = pos
                    
                    if self.level >= monster.level:
                        self.kills += 1
                        self.level += 1
                    else:
                        self.alive = False
                    break
                    
            if target_pos:
                env.monsters.pop(target_pos)

class Environment:
    def __init__(self, R=20, C=20, n_monsters=16):
        self.R = R
        self.C = C
        self.agent = Agent(random.randrange(R), random.randrange(C))
        self.monsters = {}
        
        
        level = 1
        for _ in range(n_monsters):
            while True:
                r = random.randrange(R)
                c = random.randrange(C)
                if (r, c) != (self.agent.r, self.agent.c) and (r, c) not in self.monsters:
                    break
            self.monsters[(r, c)] = Monster(r, c, level)
            level += 1
            
        self.turn = 0

    def get_blocked_positions(self):
        """Return positions that are blocked by monsters"""
        return list(self.monsters.keys())

    def get_dangerous_positions(self):
        """Return positions that are in line of sight of monsters"""
        dangerous = []
        for pos, monster in self.monsters.items():
            mr, mc = pos
            dr, dc = DIRECTION_VECTORS[monster.facing]
            nr, nc = mr + dr, mc + dc
            if 0 <= nr < self.R and 0 <= nc < self.C:
                dangerous.append((nr, nc))
        return dangerous

    def render(self):
        os.system('cls' if os.name == 'nt' else 'clear')
        
        
        grid = [[' .' for _ in range(self.C)] for _ in range(self.R)]
        
        
        for (r, c), monster in self.monsters.items():
            grid[r][c] = f"\033[91m{monster.level}{DIRECTION_ARROWS[monster.facing]}\033[0m"
            
        
        grid[self.agent.r][self.agent.c] = "\033[92m A\033[0m"
        
        
        print(f"Turn {self.turn} | Level {self.agent.level} | Kills {self.agent.kills}")
        
        
        for row in grid:
            print(" ".join(row))
            
        
        self.agent.perceive(self)
        known = []
        for pos, monster in self.agent.known_monsters.items():
            known.append(f"{pos}:L{monster.level}")
        print("Known monsters discovered:", ", ".join(known) if known else "None")

    def step(self):
        self.turn += 1
        
        
        for monster in self.monsters.values():
            monster.rotate_if_needed()
            
        
        self.agent.execute(self)
        
        
        if self.agent.alive:
            for pos, monster in self.monsters.items():
                mr, mc = pos
                dr, dc = DIRECTION_VECTORS[monster.facing]
                if (mr + dr, mc + dc) == (self.agent.r, self.agent.c):
                    self.agent.alive = False
                    break

if __name__ == "__main__":
    env = Environment()
    while env.agent.alive and env.monsters:
        env.render()
        env.step()
        time.sleep(0.002)
    env.render()
    print("\nVictory!" if env.agent.alive else "\nGame Over!")
    print(f"Level: {env.agent.level}, Kills: {env.agent.kills}, Turns: {env.turn}")