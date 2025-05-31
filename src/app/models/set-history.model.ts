import { SetType } from "./set-type.enum";

export interface SetHistory {
    setHistoryId?: string;
    orderPosition: number;
    reps: number;
    weight: number;
    completed: boolean;
    type?: SetType;
}