export const VisitorState = {
  Unvisited: 0,
  Visiting: 1,
  Visited: 2,
} as const

export type VisitorState = (typeof VisitorState)[keyof typeof VisitorState]
