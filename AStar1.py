import random
import os
import time
import heapq

# Direction definitions as constants
NORTH, SOUTH, WEST, EAST = 1, 2, 3, 4

# Helper functions for directions
def all_directions():
    return [NORTH, SOUTH, WEST, EAST]

def direction_vector(direction):
    vectors = {
        NORTH: (-1, 0),
        SOUTH: (1, 0),
        WEST: (0, -1),
        EAST: (0, 1)
    }
    return vectors[direction]

def direction_arrow(direction):
    arrows = {
        NORTH: "^",
        SOUTH: "v",
        WEST: "<",
        EAST: ">"
    }
    return arrows[direction]

def direction_name(direction):
    names = {
        NORTH: "N",
        SOUTH: "S",
        WEST: "W",
        EAST: "E"
    }
    return names[direction]

class Monster:
    def __init__(self, r, c, level):
        self.r, self.c = r, c
        self.level = level
        self.facing = random.choice(all_directions())
        self.turns_seen = 0

    def rotate_if_needed(self):
        self.turns_seen += 1
        if self.turns_seen % 2 == 0:
            # Rotate clockwise
            rotation_order = [NORTH, EAST, SOUTH, WEST]
            idx = rotation_order.index(self.facing)
            self.facing = rotation_order[(idx + 1) % len(rotation_order)]

class Agent:
    def __init__(self, r, c):
        self.r, self.c = r, c
        self.level = 1
        self.kills = 0
        self.alive = True
        self.known_monsters = {}

    def perceive(self, env):
        # Discover monsters in adjacent cells
        for direction in all_directions():
            dr, dc = direction_vector(direction)
            nr, nc = self.r + dr, self.c + dc
            if 0 <= nr < env.R and 0 <= nc < env.C and (nr, nc) in env.monsters:
                self.known_monsters[(nr, nc)] = env.monsters[(nr, nc)]

    def heuristic(self, r, c, goal):
        # Manhattan distance heuristic for A*
        return abs(r - goal[0]) + abs(c - goal[1])

    def astar(self, env, goal):
        # A* pathfinding algorithm
        R, C = env.R, env.C
        start = (self.r, self.c)
        open_heap = []
        counter = 0  # For breaking ties
        
        # Initialize with starting position
        g_start = 0
        h_start = self.heuristic(start[0], start[1], goal)
        heapq.heappush(open_heap, (g_start + h_start, counter, start, []))
        g_score = {start: 0}
        visited = set()

        while open_heap:
            _, _, (r, c), path = heapq.heappop(open_heap)
            
            if (r, c) in visited:
                continue
                
            visited.add((r, c))
            
            if (r, c) == goal:
                return path

            for direction in all_directions():
                dr, dc = direction_vector(direction)
                nr, nc = r + dr, c + dc
                neighbor = (nr, nc)
                
                if (0 <= nr < R and 0 <= nc < C and
                    neighbor not in visited and
                    neighbor not in env.blocked_positions() and
                    neighbor not in env.dangerous_positions()):

                    tentative_g = g_score[(r, c)] + 1
                    if tentative_g < g_score.get(neighbor, float('inf')):
                        g_score[neighbor] = tentative_g
                        f = tentative_g + self.heuristic(nr, nc, goal)
                        counter += 1
                        heapq.heappush(open_heap, (f, counter, neighbor, path + [direction]))
        return []  # No path found

    def plan_action(self, env):
        # Update perception of monsters
        self.perceive(env)
        
        # Remove monsters that no longer exist
        self.known_monsters = {pos: m for pos, m in self.known_monsters.items() if pos in env.monsters}

        # Find potential targets (monsters we can defeat)
        targets = []
        for pos, monster in env.monsters.items():
            if monster.level <= self.level:
                dist = abs(pos[0] - self.r) + abs(pos[1] - self.c)
                # Store negative level to sort higher levels first
                targets.append((dist, -monster.level, pos))
                
        # No valid targets, wait
        if not targets:
            return "WAIT", None
            
        # Sort by distance, then by level (higher level preferred)
        targets.sort()

        for _, _, target_pos in targets:
            tr, tc = target_pos
            
            # If adjacent to target, attack
            if abs(tr - self.r) + abs(tc - self.c) == 1:
                return "ATTACK", target_pos

            # Find safe positions around the monster
            safe_positions = []
            monster = env.monsters[target_pos]
            
            for direction in all_directions():
                dr, dc = direction_vector(direction)
                ar, ac = tr + dr, tc + dc
                
                if (0 <= ar < env.R and 0 <= ac < env.C and
                    (ar, ac) not in env.blocked_positions() and 
                    direction != monster.facing):
                    safe_positions.append((ar, ac))

            # Try to find a path to each safe position
            for spot in safe_positions:
                path = self.astar(env, spot)
                if path:  # If we found a valid path
                    return "MOVE", path[0]
                    
        return "WAIT", None  # No valid moves

    def execute(self, env):
        action, arg = self.plan_action(env)
        
        if action == "MOVE":
            dr, dc = direction_vector(arg)
            self.r += dr
            self.c += dc
        elif action == "ATTACK":
            # Remove monster and gain level if successful
            monster = env.monsters.pop(arg, None)
            if monster and self.level >= monster.level:
                self.kills += 1
                self.level += 1
            else:
                self.alive = False  # Agent dies if attack fails

class Environment:
    def __init__(self, R=20, C=20, n_monsters=16):
        self.R, self.C = R, C
        self.agent = Agent(random.randrange(R), random.randrange(C))
        self.monsters = {}
        
        # Create monsters with increasing levels
        level = 1
        for _ in range(n_monsters):
            while True:
                r, c = random.randrange(R), random.randrange(C)
                # Make sure monster isn't placed on agent or another monster
                if (r, c) != (self.agent.r, self.agent.c) and (r, c) not in self.monsters:
                    break
            self.monsters[(r, c)] = Monster(r, c, level)
            level += 1
            
        self.turn = 0

    def blocked_positions(self):
        # Positions that contain monsters
        return set(self.monsters.keys())

    def dangerous_positions(self):
        # Positions that are in the line of sight of monsters
        dangerous = set()
        for monster in self.monsters.values():
            dr, dc = direction_vector(monster.facing)
            pos = (monster.r + dr, monster.c + dc)
            if 0 <= pos[0] < self.R and 0 <= pos[1] < self.C:
                dangerous.add(pos)
        return dangerous

    def render(self):
        # Clear screen
        os.system('cls' if os.name == 'nt' else 'clear')
        
        # Create grid representation
        grid = [[' .' for _ in range(self.C)] for _ in range(self.R)]
        
        # Add monsters to grid
        for (r, c), monster in self.monsters.items():
            grid[r][c] = f"\033[91m{monster.level}{direction_arrow(monster.facing)}\033[0m"
        
        # Add agent to grid
        grid[self.agent.r][self.agent.c] = "\033[92m A\033[0m"
        
        # Print game status
        print(f"Turn {self.turn} | Level {self.agent.level} | Kills {self.agent.kills}")
        for row in grid:
            print(" ".join(row))
        
        # Show known monsters
        self.agent.perceive(self)
        known = [f"{pos}:L{m.level}" for pos, m in self.agent.known_monsters.items()]
        print("Known monsters discovered:", ", ".join(known) if known else "None")

    def step(self):
        self.turn += 1
        
        # Update monster directions
        for monster in self.monsters.values():
            monster.rotate_if_needed()
        
        # Agent takes its turn
        self.agent.execute(self)
        
        # Check if agent is in danger
        if self.agent.alive:
            for monster in self.monsters.values():
                dr, dc = direction_vector(monster.facing)
                if (monster.r + dr, monster.c + dc) == (self.agent.r, self.agent.c):
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