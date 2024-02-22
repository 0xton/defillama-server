import { dailyTvl, dailyUsdTokensTvl, dailyTokensTvl } from "../utils/getLastRecord";
import type { Protocol } from "../protocols/data";
import protocols from "../protocols/data";
import entities from "../protocols/entities";
import treasuries from "../protocols/treasury";
import PromisePool from "@supercharge/promise-pool";
import dynamodb, { batchWrite } from "../utils/shared/dynamodb";
import { getCurrentUnixTimestamp } from "../utils/date";
import setEnvSecrets from "../utils/shared/setEnvSecrets";

const ids: string[] = [
  "2",
  "431",
  "494",
  "646",
  "690",
  "691",
  "694",
  "1033",
  "1154",
  "1252",
  "1594",
  "1896",
  "2081",
  "2269",
  "2272",
  "2274",
  "2275",
  "2276",
  "2286",
  "2300",
  "2304",
  "2305",
  "2314",
  "2346",
  "2352",
  "2363",
  "2366",
  "2371",
  "2391",
  "2432",
  "2507",
  "2561",
  "2765",
  "2836",
  "2932",
  "3005",
  "3006",
  "3007",
  "3013",
  "3075",
  "3113",
  "3193",
  "3544",
  "3546",
  "3547",
  "3578",
  "3944",
  "4031",
  "4042",
  "2724-treasury",
];
const start = 1706659200; // 00:00 31 Jan

export default async function getTVLsOfRecordBetweenTimestamps(PK: string, start: number, end: number) {
  return dynamodb.query({
    ExpressionAttributeValues: {
      ":pk": PK,
      ":begin": start,
      ":end": end,
    },
    KeyConditionExpression: "PK = :pk AND SK BETWEEN :begin AND :end",
  });
}

async function main() {
  await setEnvSecrets();
  let actions: Protocol[] = [protocols, entities, treasuries].flat();
  const tronProtocols: Protocol[] = actions.filter((a: Protocol) => ids.includes(a.id));
  const end: number = 1708473600;
  const writes: Promise<void>[] = [];

  await PromisePool.withConcurrency(1)
    .for(tronProtocols)
    .process(async (protocol: Protocol) => {
      let [dailyTvls, dailyUsdTvls, dailyRawTvls] = await Promise.all([
        getTVLsOfRecordBetweenTimestamps(dailyTvl(protocol.id), start, end),
        getTVLsOfRecordBetweenTimestamps(dailyUsdTokensTvl(protocol.id), start, end),
        getTVLsOfRecordBetweenTimestamps(dailyTokensTvl(protocol.id), start, end),
      ]);

      dailyUsdTvls.Items?.map((entry: any) => {
        if ("tron" in entry && "TRX" in entry.tron) {
          const old = entry.tron.TRX;
          const scaled = (entry.tron.TRX *= 1e12);
          const delta = scaled - old;
          const daily = dailyTvls.Items?.find((d: any) => d.SK == entry.SK);
          if (!daily) throw new Error(`wheres the daily for id ${protocol.id}`);
          daily.tron += delta;
          daily.tvl += delta;
          daily.entry.tron.TRX *= 1e12;
        }
      });

      dailyRawTvls.Items?.map((entry: any) => {
        if (!("tron" in entry && "TRX" in entry.tron)) throw new Error(`wheres the raw for id ${protocol.id}`);
        entry.tron.TRX *= 1e12;
      });

      const writes = [...(dailyTvls.Items ?? []), ...(dailyUsdTvls.Items ?? []), ...(dailyRawTvls.Items ?? [])];
      writes.push(batchWrite(writes, true));
    });

  await Promise.all(writes);
  console.log("done");
}
main(); // ts-node defi/src/cli/tronPatch.ts
