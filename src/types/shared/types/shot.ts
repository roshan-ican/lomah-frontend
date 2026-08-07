
export interface Shot {
  id: string;
  sessionStageId: string;
  /** 1-based sequence within the STAGE, not the whole session. */
  shotNumber: number;
  x: number;
  y: number;
  score: number;
  /** True only for a sensor sentinel — "fired but resolved nothing". A real
   *  hit that landed outside every scoring ring is score 0, isMiss false. */
  isMiss: boolean;
  /** Placeholder for a bullet whose frame never reached the server, written so
   *  shotNumber stays contiguous with what was actually fired. Always implies
   *  isMiss; x/y/score are zero and meaningless. */
  isLost?: boolean;
  firedAt: string;
}
