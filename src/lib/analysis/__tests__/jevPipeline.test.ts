import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestConsistentJevDecision } from "../jevPipeline";
import { requestJevDecision } from "../jevClient";
import { buildJevDecisionRequest } from "../jevDecision";
import type { EvidenceSnapshot } from "../evidence";
vi.mock("../jevClient", () => ({requestJevDecision:vi.fn()}));
const call=vi.mocked(requestJevDecision);
const choice=(value:string)=>({type:"choice",choice:value,probabilities:{[value]:1},confidence:1});
const snapshot = {symbol:"TEST",price:100,items:[],levels:[
  {price:95,kind:"support",source:"horizontal",strength:1},
  {price:110,kind:"resistance",source:"horizontal",strength:1}],
  dataQuality:{dailyBarComplete:true,weeklyBarComplete:true,missingFamilies:[]}} as unknown as EvidenceSnapshot;
const request=buildJevDecisionRequest({snapshot,dailyCandles:[],weeklyCandles:[]});
const primary={answers:{outlook:choice("bullish"),setupStage:choice("right_triggered")}};
const follow=(stop:string)=>({answers:{entryQuality:{type:"score",score:4,confidence:0.8},
  holderAction:choice("hold"),stopTrigger:choice("close"),stopLevel:choice(stop),targetLevel:choice("t1")}});
describe("Jev model-owned decision repair",()=>{
  beforeEach(()=>vi.resetAllMocks());
  it("repairs missing stop by asking Jev again rather than lowering its decision locally",async()=>{
    call.mockResolvedValueOnce(primary).mockResolvedValueOnce(follow("none"))
      .mockResolvedValueOnce(primary).mockResolvedValueOnce(follow("s1"));
    const result=await requestConsistentJevDecision(request,[],{apiKey:"test"},Date.now()+30_000);
    expect(result.decision.activeSetup).toBe("right");
    expect(result.decision.adjustments).toEqual([]);
    expect(JSON.stringify(call.mock.calls[2][0])).toContain("requires a stop and target");
    expect(call).toHaveBeenCalledTimes(4);
  });
  it("fails after one repair without local replacement",async()=>{
    call.mockResolvedValueOnce(primary).mockResolvedValueOnce(follow("none"))
      .mockResolvedValueOnce(primary).mockResolvedValueOnce(follow("none"));
    await expect(requestConsistentJevDecision(request,[],{apiKey:"test"},Date.now()+30_000)).rejects.toThrow("after one repair");
  });
  it("does not retry transport failures as logical repairs",async()=>{
    call.mockRejectedValue(new Error("HTTP 524"));
    await expect(requestConsistentJevDecision(request,[],{apiKey:"test"},Date.now()+30_000)).rejects.toThrow("524");
    expect(call).toHaveBeenCalledTimes(1);
  });
});
