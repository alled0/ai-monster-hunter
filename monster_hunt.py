# monster_hunt.py
import random, os, time
from collections import deque
from enum import Enum, auto

# ---------- basic data structures ----------
class Dir(Enum):
    N = auto(); S = auto(); W = auto(); E = auto()

    @staticmethod
    def all():
        return [Dir.N, Dir.S, Dir.W, Dir.E]

    def vec(self):   # (dr, dc)
        return {Dir.N: (-1, 0), Dir.S: (1, 0),
                Dir.W: (0, -1), Dir.E: (0, 1)}[self]

    def arrow(self):
        return {Dir.N: "^", Dir.S: "v",
                Dir.W: "<", Dir.E: ">"}[self]

# ---------- environment entities ------------
class Monster:
    """Rotates clockwise every *second* environment step."""
    def __init__(self, r, c, level):
        self.r, self.c, self.level = r, c, level
        self.facing = random.choice(Dir.all())
        self.turns_seen = 0            # +1 every env.step()

    def rotate_if_needed(self):
        self.turns_seen += 1
        if self.turns_seen % 2 == 0:   # rotate on even counts
            CW = [Dir.N, Dir.E, Dir.S, Dir.W]
            self.facing = CW[(CW.index(self.facing) + 1) % 4]

# ---------------- agent ---------------------
class Agent:
    def __init__(self, r, c):
        self.r, self.c = r, c
        self.level = 1
        self.kills = 0
        self.alive = True
        # {(r,c): (level, last_seen_turn)}
        self.known_monsters = {}

    # ---------- helper: predict facing next turn ----------
    @staticmethod
    def predict_facing(mon):
        CW = [Dir.N, Dir.E, Dir.S, Dir.W]
        idx = CW.index(mon.facing)
        # after env.step() *next* turn, Monster.rotate_if_needed() will
        # increment turns_seen *then* rotate if even
        will_rotate = ((mon.turns_seen + 1) % 2 == 0)
        return CW[(idx + 1) % 4] if will_rotate else mon.facing

    # ---------- path‑finding ----------
    def bfs(self, env, goal):
        R, C = env.R, env.C
        q = deque(); q.append((self.r, self.c, []))
        visited = {(self.r, self.c)}
        while q:
            r, c, path = q.popleft()
            if (r, c) == goal:
                return path
            for d in Dir.all():
                dr, dc = d.vec()
                nr, nc = r + dr, c + dc
                if 0 <= nr < R <= env.R and 0 <= nc < C <= env.C:
                    pass  # mypy hint
                if (0 <= nr < R and 0 <= nc < C and
                        (nr, nc) not in visited and
                        (nr, nc) not in env.blocked()):
                    visited.add((nr, nc))
                    q.append((nr, nc, path + [d]))
        return []

    # ---------- decide ----------
    def plan_action(self, env):
        # 1) update short‑range memory
        for (mr, mc), mon in env.monsters.items():
            if abs(mr - self.r) <= 2 and abs(mc - self.c) <= 2:
                self.known_monsters[(mr, mc)] = (mon.level, env.turn)

        # 2) pick weakest monster ≤ our level
        viable = []
        for (mr, mc), m in env.monsters.items():
            if m.level <= self.level:  # can safely attack equal or lower level
                dist = abs(mr - self.r) + abs(mc - self.c)  # Manhattan
                viable.append((dist, m.level, (mr, mc)))

        if not viable:
            return "WAIT", None

        viable.sort()  # (distance, level, position)
        _, target_lvl, (tr, tc) = viable[0]
        tgt = env.monsters[(tr, tc)]
        next_face = self.predict_facing(tgt)

        # 3) already adjacent? attack if *next* facing is safe
        if abs(tr - self.r) + abs(tc - self.c) == 1:
            dr, dc = self.r - tr, self.c - tc        # dir agent←monster
            dir_from_mon = [d for d in Dir.all() if d.vec() == (dr, dc)][0]
            if dir_from_mon != next_face:            # not facing us next turn
                return "ATTACK", (tr, tc)
            return "WAIT", None                     # stare‑down

        # 4) find an adjacent square that will be safe next turn
        safe_neighbors = []
        for d in Dir.all():
            ar, ac = tr + d.vec()[0], tc + d.vec()[1]
            if (0 <= ar < env.R and 0 <= ac < env.C and
                    (ar, ac) not in env.blocked() and d != next_face):
                safe_neighbors.append((ar, ac))
        # shortest path to any safe neighbor
        for goal in safe_neighbors:
            path = self.bfs(env, goal)
            if path:
                return "MOVE", path[0]
        return "WAIT", None

    # ---------- act ----------
    def execute(self, env):
        act, arg = self.plan_action(env)
        if act == "WAIT":
            return
        if act == "MOVE":
            dr, dc = arg.vec()
            self.r += dr; self.c += dc
        elif act == "ATTACK":
            mon = env.monsters.pop(arg)
            if self.level >= mon.level:
                self.kills += 1
                self.level += 1
            else:
                self.alive = False

# --------------- world ----------------------
class Environment:
    def __init__(self, R=10, C=10, n_monsters=8, seed=None):
        random.seed(seed)
        self.R, self.C = R, C
        ar, ac = random.randrange(R), random.randrange(C)
        self.agent = Agent(ar, ac)
        self.monsters = {}
        for _ in range(n_monsters):
            while True:
                r, c = random.randrange(R), random.randrange(C)
                if (r, c) != (ar, ac) and (r, c) not in self.monsters:
                    break
            lvl = random.randint(1, 7)
            self.monsters[(r, c)] = Monster(r, c, lvl)

        self.turn = 0
        self.ensure_weaker_monster()  # guarantee at least one target

    # ----- helper to satisfy "always weaker" invariant -----
    def ensure_weaker_monster(self):
        """If every remaining monster outranks the agent, downgrade one."""
        if not self.monsters:
            return
        if min(m.level for m in self.monsters.values()) > self.agent.level:
            # Pick the weakest monster and set its level just below the agent's
            weakest = min(self.monsters.values(), key=lambda m: m.level)
            weakest.level = max(1, self.agent.level)  # equal is acceptable

    def blocked(self):
        return set(self.monsters.keys())

    # --------- rendering ----------
    def render(self):
        grid = [[" ." for _ in range(self.C)] for _ in range(self.R)]
        for (r, c), m in self.monsters.items():
            grid[r][c] = f"{m.level}{m.facing.arrow()}"
        grid[self.agent.r][self.agent.c] = " A"
        os.system("cls" if os.name == "nt" else "clear")
        print(f"Turn {self.turn}  |  Level={self.agent.level}  "
              f"|  Kills={self.agent.kills}")
        for row in grid:
            print(" ".join(row))
        print("\nLegend: A=Agent   d^/<d/>/dv = monster level d, arrow=facing")

    # --------- one step ----------
    def step(self):
        self.turn += 1
        for m in self.monsters.values():
            m.rotate_if_needed()
        self.agent.execute(self)
        # monster retaliation (only the square directly ahead)
        for m in self.monsters.values():
            dr, dc = m.facing.vec()
            if (m.r + dr, m.c + dc) == (self.agent.r, self.agent.c):
                self.agent.alive = False

        self.ensure_weaker_monster()  # maintain invariant each turn

# --------------- main loop ------------------
if __name__ == "__main__":
    env = Environment(R=12, C=12, n_monsters=8, seed=None)
    while env.agent.alive and env.monsters:
        env.render()
        env.step()
        time.sleep(0.3)
    env.render()
    print("\n🎉 Agent won!" if env.agent.alive else "\n☠️ Agent died.")
