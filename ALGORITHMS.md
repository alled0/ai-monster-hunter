# Algorithm Comparison

A breakdown of the four pathfinding algorithms used in this simulation.

---

## Overview

| | Simple BFS | Basic BFS | A* | A* + Manhattan |
|---|---|---|---|---|
| **Search method** | BFS | BFS | A* | A* |
| **Vision range** | 8 neighbors | 4 neighbors | 4 neighbors | 4 neighbors |
| **World knowledge** | Global | Partial (memory) | Global | Partial (memory) |
| **Explores unknown** | No | Yes | No | Yes |
| **Approach angle** | Any side | Any known side | Safe side only | Safe side only |
| **Fallback behavior** | Random move | Wait | Wait | Wait |

---

## Simple BFS

The most basic agent. It uses breadth-first search to find a path to any reachable target.

**How it works:**
- Scans all 8 surrounding cells (including diagonals) to detect nearby monsters
- Targets the closest monster it can defeat (level ≤ agent level)
- Uses BFS to find a path to a cell adjacent to the target
- If no target is visible, picks a random safe direction and moves

**Strengths:** Fast to react when monsters are nearby, simple and predictable.

**Weaknesses:** Wide-open vision can feel unrealistic. Random fallback movement is inefficient and occasionally walks into danger zones.

---

## Basic BFS

A more realistic agent with limited, incremental knowledge of its environment.

**How it works:**
- Perceives only the 4 cardinal neighbors (N/S/W/E) each turn
- Maintains a memory of visited (free) cells and seen monsters
- When a target is within memory, uses BFS to path toward it from a known safe cell
- When no target is known, explores the nearest frontier — cells on the edge of its known map
- Refuses to move into a danger zone; waits instead

**Strengths:** Methodical map exploration, cautious danger avoidance, realistic perception model.

**Weaknesses:** Can get stuck waiting when all neighboring paths are blocked. Slower to find targets since it only builds knowledge incrementally.

---

## A* (Pure)

Uses the A* search algorithm with a Manhattan distance heuristic for more efficient pathfinding than BFS.

**How it works:**
- Like Simple BFS, it has full knowledge of all monster positions
- Uses A* to find shortest paths, prioritizing cells closer to the goal (fewer nodes explored than BFS)
- Specifically targets the side of the monster that is *not* its facing direction, avoiding its line of sight
- Waits if no valid path exists

**Strengths:** More efficient pathfinding than BFS (fewer cells explored). Smarter approach angle — deliberately flanks monsters from behind or the side.

**Weaknesses:** Still relies on global knowledge, which is unrealistic. No exploration behavior when no beatable monster exists.

---

## A* + Manhattan Explore

Combines the efficiency of A* with the incremental exploration behavior of Basic BFS.

**How it works:**
- Perceives only 4 cardinal neighbors and builds a memory map, same as Basic BFS
- When a beatable monster is reachable, uses A* to plan the path
- Approaches monsters from their non-facing side, same as pure A*
- When no target is in memory, uses A* to navigate toward the nearest unexplored frontier cell
- Waits if all options are blocked

**Strengths:** Best of both worlds — efficient pathfinding and realistic partial knowledge. Systematic exploration with smarter routing than BFS-based exploration.

**Weaknesses:** Most complex behavior; can occasionally wait too long if frontier cells are all blocked by danger zones.

---

## Key Differences at a Glance

**Vision:** Simple BFS sees diagonals; the other three only see cardinal directions.

**Knowledge:** Simple BFS and pure A* know where every monster is from the start. Basic BFS and A*+Manhattan only know what they have personally observed.

**Exploration:** Basic BFS and A*+Manhattan actively explore unknown parts of the grid. Simple BFS and pure A* wander randomly or wait when no target is in range.

**Path quality:** BFS finds *a* shortest path. A* finds the shortest path *faster* by using distance-to-goal as a guide, which matters more on larger grids.

**Approach strategy:** Only A* and A*+Manhattan deliberately approach monsters from a non-facing side, reducing the chance of being hit.
