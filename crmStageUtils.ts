/** Default win probability when a lead sits in this pipeline stage */
export const PROBABILITY_BY_STAGE: Record<string, number> = {
    new: 10,
    waiting: 15,
    qualified: 25,
    proposal: 50,
    negotiation: 75,
    won: 100,
    notInterested: 0
};

export function probabilityForStage(stageId: string): number {
    return PROBABILITY_BY_STAGE[stageId] ?? 10;
}
