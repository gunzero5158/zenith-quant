export interface AnalysisDisplayState<T> {
  data: T | null;
  error: string | null;
}

export type AnalysisDisplayEvent<T> =
  | { type: "request_started" }
  | { type: "request_succeeded"; data: T }
  | { type: "request_failed"; error: string };

export function reduceAnalysisDisplay<T>(
  state: AnalysisDisplayState<T>,
  event: AnalysisDisplayEvent<T>
): AnalysisDisplayState<T> {
  switch (event.type) {
    case "request_started":
      return { data: null, error: null };
    case "request_succeeded":
      return { data: event.data, error: null };
    case "request_failed":
      return { data: null, error: event.error };
    default:
      return state;
  }
}
