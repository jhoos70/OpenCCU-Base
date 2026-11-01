import Collection from "./Collection";

/** The rooms, as in the classic "Rooms": pick a room, see and operate the channels in it as tiles. */
export default function Rooms({ sid, onExpired }: { sid: string; onExpired: () => void }) {
  return <Collection kind="rooms" sid={sid} onExpired={onExpired} />;
}
