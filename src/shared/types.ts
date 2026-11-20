export interface Point {
  x: number;
  y: number;
}
export interface Node extends Point {
  in: Point;
  out: Point;
}
export interface Shape {
  id: string;
  name: string;
  nodes: Node[];
  closed: boolean;
  fill: string;
  stroke: string;
  width: number;
  opacity: number;
  group?: string;
  /** Hidden objects are neither drawn nor valid snap targets. */
  hidden?: boolean;
  /** Locked objects stay visible but cannot be edited or snapped to. */
  locked?: boolean;
}
export interface Document {
  shapes: Shape[];
  selected: string[];
  tool: string;
  zoom: number;
}
