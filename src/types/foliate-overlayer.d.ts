/**
 * Type stub for 'foliate-js/overlayer.js', wired in via tsconfig `paths` --
 * same arrangement, and same reasoning, as foliate-view.d.ts.
 *
 * Only `highlight` is used here (passed as the draw function to the
 * `draw-annotation` event's `detail.draw`); the class isn't otherwise
 * constructed or called directly by this app.
 */
export interface OverlayerRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export declare class Overlayer {
  static highlight(rects: OverlayerRect[], options?: { color?: string; padding?: number }): SVGElement
}
