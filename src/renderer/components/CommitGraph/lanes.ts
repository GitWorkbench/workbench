/**
 * Layout constants and lane colours shared by `CommitGraph.tsx`
 * and the GitGraph canvas in `GitGraphCanvas.tsx`.
 *
 * The GitGraph canvas renders a connected SVG graph for the list,
 * lining up with rows starting at `REFS_W` fixed width.
 */
export const LANE_W = 20;
export const ROW_H = 32;
export const BRANCH_W = 180;

export const LANE_COLORS = ['#26c6da', '#4f8cff', '#9b7bff', '#66bb6a', '#ffb74d', '#ef6c9a', '#ab47bc', '#ff8a65', '#aed581'];

export function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length];
}
