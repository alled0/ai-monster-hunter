import random
import os
import time
from collections import deque
from enum import Enum, auto

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
        self.turns = 0

    def rotate_if_needed(self):
        self.turns += 1
        if self.turns % 2 == 0:
            order = [Dir.N, Dir.E, Dir.S, Dir.W]
            idx = order.index(self.facing)
            self.facing = order[(idx + 1) % len(order)]

class Agent:
    def __init__(self, r, c):
        self.r = r
        self.c = c
        self.level = 1
        self.kills = 0
        self.alive = True
        self.known_free = {(r, c)}
        self.known_monsters = {}

    def perceive(self, env):
        for d in Dir.all():
            nr, nc = self.r + d.vec()[0], self.c + d.vec()[1]
            if 0 <= nr < env.R and 0 <= nc < env.C:
                if (nr, nc) in env.monsters:
                    self.known_monsters[(nr, nc)] = env.monsters[(nr, nc)]
                else:
                    self.known_free.add((nr, nc))

    def bfs(self, goal, blocked, avoid_danger, env):
        q = deque([(self.r, self.c)])
        parent = {(self.r, self.c): None}
        move_dir = {}

        blocked_all = set(blocked)
        if avoid_danger:
            blocked_all |= env.dangerous_tiles()

        while q:
            cur = q.popleft()
            if cur == goal:
                path = []
                node = cur
                while parent[node] is not None:
                    path.append(move_dir[node])
                    node = parent[node]
                return list(reversed(path))

            for d in Dir.all():
                nr, nc = cur[0] + d.vec()[0], cur[1] + d.vec()[1]
                nxt = (nr, nc)
                if not (0 <= nr < env.R and 0 <= nc < env.C):
                    continue
                if nxt in blocked_all or nxt in parent:
                    continue
                parent[nxt] = cur
                move_dir[nxt] = d
                q.append(nxt)

        return []

    def plan_action(self, env):
        self.perceive(env)

        if self.known_monsters:
            choices = []
            for pos, m in self.known_monsters.items():
                if m.level <= self.level:
                    dist = abs(pos[0] - self.r) + abs(pos[1] - self.c)
                    choices.append((dist, -m.level, pos))
            if choices:
                choices.sort()
                _, _, tgt = choices[0]
                m = self.known_monsters[tgt]

                if abs(tgt[0] - self.r) + abs(tgt[1] - self.c) == 1:
                    return "ATTACK", tgt

                safe_spots = []
                for d in Dir.all():
                    ar, ac = tgt[0] + d.vec()[0], tgt[1] + d.vec()[1]
                    if (ar, ac) in self.known_free and d != m.facing:
                        safe_spots.append((ar, ac))
                for spot in safe_spots:
                    path = self.bfs(spot, self.known_monsters, True, env)
                    if path:
                        next_cell = (self.r + path[0].vec()[0], self.c + path[0].vec()[1])
                        if next_cell in env.dangerous_tiles():
                            return "WAIT", None
                        return "MOVE", path[0]

        frontiers = []
        for cell in self.known_free:
            for d in Dir.all():
                nbr = (cell[0] + d.vec()[0], cell[1] + d.vec()[1])
                if 0 <= nbr[0] < env.R and 0 <= nbr[1] < env.C \
                   and nbr not in self.known_free \
                   and nbr not in self.known_monsters:
                    frontiers.append(cell)
                    break

        if frontiers:
            frontiers.sort(key=lambda c: abs(c[0] - self.r) + abs(c[1] - self.c))
            goal = frontiers[0]
            path = self.bfs(goal, self.known_monsters, True, env)
            if path:
                next_cell = (self.r + path[0].vec()[0], self.c + path[0].vec()[1])
                if next_cell not in env.dangerous_tiles():
                    return "MOVE", path[0]

        return "WAIT", None

    def execute(self, env):
        action, arg = self.plan_action(env)
        if action == "MOVE":
            dr, dc = arg.vec()
            self.r += dr
            self.c += dc
        elif action == "ATTACK":
            m = env.monsters.pop(arg, None)
            if m and self.level >= m.level:
                self.kills += 1
                self.level += 1
                self.known_monsters.pop(arg, None)
            else:
                self.alive = False

class Environment:
    def __init__(self, R=20, C=20, n_monsters=16):
        self.R = R
        self.C = C
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

    def dangerous_tiles(self):
        tiles = set()
        for m in self.monsters.values():
            dr, dc = m.facing.vec()
            pos = (m.r + dr, m.c + dc)
            if 0 <= pos[0] < self.R and 0 <= pos[1] < self.C:
                tiles.add(pos)
        return tiles

    def render(self):
        os.system('cls' if os.name == 'nt' else 'clear')
        grid = [[' .' for _ in range(self.C)] for _ in range(self.R)]
        for (r, c), m in self.monsters.items():
            grid[r][c] = f"\033[91m{m.level}{m.facing.arrow()}\033[0m"
        grid[self.agent.r][self.agent.c] = "\033[92m A\033[0m"
        print(f"Turn {self.turn} | Level {self.agent.level} | Kills {self.agent.kills}")
        for row in grid:
            print(" ".join(row))
        known = [f"{pos}:L{m.level}" for pos, m in self.agent.known_monsters.items()]
        print("Known monsters discovered:", ", ".join(known) if known else "None")

    def step(self):
        self.turn += 1
        for m in list(self.monsters.values()):
            m.rotate_if_needed()
        self.agent.execute(self)
        if self.agent.alive:
            for m in self.monsters.values():
                dr, dc = m.facing.vec()
                if (m.r + dr, m.c + dc) == (self.agent.r, self.agent.c):
                    self.agent.alive = False
                    break

if __name__ == "__main__":
    env = Environment()
    while env.agent.alive and env.monsters:
        env.render()
        env.step()
        time.sleep(0.02)
    env.render()
    print("\nVictory!" if env.agent.alive else "\nGame Over!")
    print(f"Final Level: {env.agent.level}  Kills: {env.agent.kills}  Turns: {env.turn}")