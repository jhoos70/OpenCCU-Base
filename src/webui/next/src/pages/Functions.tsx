import Collection from "./Collection";

/** The functions (Gewerke), as in the classic "Functions": pick one, see and operate its channels as tiles. */
export default function Functions({ sid, onExpired }: { sid: string; onExpired: () => void }) {
  return <Collection kind="functions" sid={sid} onExpired={onExpired} />;
}
