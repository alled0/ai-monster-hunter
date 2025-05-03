import random
import os
import time
import heapq
from enum import Enum, auto

DEBUG = True

def debug_print(*args, **kwargs):
    if DEBUG:
        print(*args, **kwargs)

class Dir(Enum):
    N = auto()
    S = auto()
    W = auto()
    E = auto()

    @staticmethod
    def all():
        return [Dir.N, Dir.S, Dir.W, Dir.E]

    def vec(self):
        return {
            Dir.N: (-1, 0),
            Dir.S: (1, 0),
            Dir.W: (0, -1),
            Dir.E: (0, 1)
        }[self]

    def arrow(self):
        return {
            Dir.N: "^",
            Dir.S: "v",
            Dir.W: "<",
            Dir.E: ">"
        }[self]
    
    def __str__(self):
        return self.name

class Monster:
    def __init__(self, r, c, level):
        self.r = r
        self.c = c
        self.level = level
        self.facing = random.choice(Dir.all())
        self.turns_seen = 0
        debug_print(f"Created monster: pos=({r},{c}), level={level}, facing={self.facing}")

    def rotate_if_needed(self):
        self.turns_seen += 1
        if self.turns_seen % 2 == 0:
            CW = [Dir.N, Dir.E, Dir.S, Dir.W]
            idx = CW.index(self.facing)
            self.facing = CW[(idx + 1) % 4]
            debug_print(f"Monster rotated: {self.facing}")

class Agent:
    def __init__(self, r, c):
        self.r = r
        self.c = c
        self.level = 1
        self.kills = 0
        self.alive = True
        self.known_monsters = {}
        debug_print(f"Created agent: pos=({r},{c}), level={self.level}")

    def astar(self, env, goal):
        R, C = env.R, env.C
        
        frontier = []
        counter = 0
        start = (self.r, self.c)
        heapq.heappush(frontier, (0 + self._h(start, goal), counter, (self.r, self.c, [], 0)))
        
        reached = {start: 0}

        while frontier:
            f, _, (r, c, path, g) = heapq.heappop(frontier)

            
            if (r, c) == goal:
                return path

            
            for direction in Dir.all():
                dr, dc = direction.vec()
                nr, nc = r + dr, c + dc
                if not (0 <= nr < R and 0 <= nc < C):
                    continue
                if (nr, nc) in env.blocked() or (nr, nc) in env.dangerous_tiles():
                    continue

                new_g = g + 1
                prev_g = reached.get((nr, nc), float('inf'))

                
                if new_g < prev_g:
                    reached[(nr, nc)] = new_g
                    new_f = new_g + self._h((nr, nc), goal)
                    counter += 1
                    heapq.heappush(frontier, (new_f, counter, (nr, nc, path + [direction], new_g)))

        
        return []

    def _h(self, pos, goal):
        
        return abs(pos[0] - goal[0]) + abs(pos[1] - goal[1])

    def plan_action(self, env):
        debug_print("\n--- PLANNING ACTION ---")
        
        self.known_monsters = {k:v for k,v in self.known_monsters.items() if k in env.monsters}

        
        viable = []
        for (mr, mc), m in env.monsters.items():
            if m.level <= self.level:
                dist = abs(mr - self.r) + abs(mc - self.c)
                viable.append((dist, -m.level, (mr, mc)))

        if not viable:
            return "WAIT", None

        viable.sort()
        for _, _, target in viable:
            m = env.monsters.get(target)
            if not m:
                continue

            
            if abs(target[0] - self.r) + abs(target[1] - self.c) == 1:
                return "ATTACK", target

            
            safe = []
            for d in Dir.all():
                ar, ac = target[0] + d.vec()[0], target[1] + d.vec()[1]
                if (0 <= ar < env.R and 0 <= ac < env.C
                    and (ar, ac) not in env.blocked()
                    and d != m.facing):
                    safe.append((ar, ac))

            
            for spot in safe:
                path = self.astar(env, spot)
                if path:
                    return "MOVE", path[0]

        return "WAIT", None

    def execute(self, env):
        action, arg = self.plan_action(env)
        debug_print(f"Executing: {action} {arg}")
        if action == "MOVE":
            dr, dc = arg.vec()
            self.r += dr
            self.c += dc
        elif action == "ATTACK":
            monster = env.monsters.pop(arg, None)
            if monster and self.level >= monster.level:
                self.kills += 1
                self.level += 1
            else:
                self.alive = False

class Environment:
    def __init__(self, R=20, C=20, n_monsters=16):
        self.R, self.C = R, C
        self.agent = Agent(random.randrange(R), random.randrange(C))
        self.monsters = {}
        lvl = 1
        for _ in range(n_monsters):
            while True:
                r, c = random.randrange(R), random.randrange(C)
                if (r, c) != (self.agent.r, self.agent.c) and (r, c) not in self.monsters:
                    break
            self.monsters[(r, c)] = Monster(r, c, lvl)
            lvl += 1
        self.turn = 0

    def blocked(self):
        return set(self.monsters.keys())

    def dangerous_tiles(self):
        tiles = set()
        for m in self.monsters.values():
            dr, dc = m.facing.vec()
            pos = (m.r + dr, m.c + dc)
            if 0 <= pos[0] < self.R and 0 <= pos[1] < self.C:
                tiles.add(pos)
        return tiles

    def render(self):
        if not DEBUG:
            os.system('cls' if os.name=='nt' else 'clear')
        grid = [[' .' for _ in range(self.C)] for _ in range(self.R)]
        for (r, c), m in self.monsters.items():
            grid[r][c] = f"\033[91m{m.level}{m.facing.arrow()}\033[0m"
        grid[self.agent.r][self.agent.c] = "\033[92m A\033[0m"

        print(f"Turn {self.turn} | Level {self.agent.level} | Kills {self.agent.kills}")
        for row in grid:
            print(" ".join(row))

    def step(self):
        self.turn += 1
        for m in self.monsters.values():
            m.rotate_if_needed()
        self.agent.execute(self)
        
        if self.agent.alive:
            for m in self.monsters.values():
                dr, dc = m.facing.vec()
                if (m.r+dr, m.c+dc) == (self.agent.r, self.agent.c):
                    self.agent.alive = False
                    break

if __name__ == "__main__":
    env = Environment()
    while env.agent.alive and env.monsters:
        env.render()
        env.step()
        time.sleep(0)
    env.render()
    print("\nVictory!" if env.agent.alive else "\nGame Over!")
    print(f"Level: {env.agent.level}, Kills: {env.agent.kills}, Turns: {env.turn}")
