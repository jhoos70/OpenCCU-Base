import Collection from "./Collection";

/** The favourite lists of the signed-in user, as in the classic "Favorites": pick a list, see and operate its members as tiles. */
export default function Favourites({ sid, onExpired }: { sid: string; onExpired: () => void }) {
  return <Collection kind="favourites" sid={sid} onExpired={onExpired} />;
}
