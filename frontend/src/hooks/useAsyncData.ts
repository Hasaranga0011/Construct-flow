import { useCallback, useEffect, useState } from "react";
export function useAsyncData<T>(
  load: (signal: AbortSignal) => Promise<T>,
  timeout = 15000,
) {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: string | null;
    loader: typeof load;
  }>({ data: null, loading: true, error: null, loader: load });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null, loader: load });
    const timer = setTimeout(() => {
      controller.abort();
      setState({
        data: null,
        loading: false,
        error: "Request timed out. Check your connection and try again.",
        loader: load,
      });
    }, timeout);
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ data, loading: false, error: null, loader: load });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setState({
            data: null,
            loading: false,
            error: e.message || "Unable to load your data.",
            loader: load,
          });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [load, revision, timeout]);
  const current = state.loader === load;
  return {
    data: current ? state.data : null,
    loading: current ? state.loading : true,
    error: current ? state.error : null,
    retry,
  };
}
