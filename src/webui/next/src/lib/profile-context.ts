import * as React from "react";
import type { Profile } from "./api";

/** The signed-in user's profile, once it has loaded (null before). Provided by the shell. */
export const ProfileContext = React.createContext<Profile | null>(null);
export const useCurrentProfile = (): Profile | null => React.useContext(ProfileContext);
