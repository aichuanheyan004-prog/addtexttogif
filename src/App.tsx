import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Download,
  Image as ImageIcon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Type,
  Undo2,
  Upload,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GIF_LIMITS,
  type DecodedGif,
  type TextAlign,
  type TextLayer,
  clampFrameRange,
  clampLayerToCanvas,
  createCanvasFrameRenderer,
  createDefaultLayer,
  decodeGifBuffer,
  drawTextLayerOnCanvas,
  encodeEditedGif,
  formatBytes,
  formatMs,
  getActiveLayers,
  getFrameStartMs,
  pointHitsLayer
} from "./lib/gifPipeline";

type StatusKind = "info" | "error";

interface StatusState {
  kind: StatusKind;
  message: string;
}

interface ExportState {
  progress: number;
  message: string;
}

const FONT_OPTIONS = [
  { label: "Impact", value: "Impact, Arial Black, Arial, sans-serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier", value: "Courier New, monospace" },
  { label: "System", value: "Inter, system-ui, sans-serif" }
];

const LIMIT_SUMMARY = `${formatBytes(GIF_LIMITS.maxFileBytes)}, ${GIF_LIMITS.maxFrames} frames, ${GIF_LIMITS.maxSide}px longest side, ${formatMs(GIF_LIMITS.maxDurationMs)} duration`;

export function GifEditor() {
  const [decoded, setDecoded] = useState<DecodedGif | null>(null);
  const [layers, setLayers] = useState<TextLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [history, setHistory] = useState<TextLayer[][]>([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);
  const [exportState, setExportState] = useState<ExportState | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusState>({
    kind: "info",
    message: `Tested browser limits: ${LIMIT_SUMMARY}.`
  });
  const exportController = useRef<AbortController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  const selectedLayer = useMemo(
    () => layers.find((layer) => layer.id === selectedLayerId) ?? layers[0] ?? null,
    [layers, selectedLayerId]
  );

  const frameCount = decoded?.frames.length ?? 0;
  const frameTime = decoded ? getFrameStartMs(decoded, currentFrame) : 0;

  const cloneLayers = useCallback((items: TextLayer[]) => items.map((layer) => ({ ...layer })), []);

  const pushHistory = useCallback(() => {
    setHistory((previous) => [cloneLayers(layers), ...previous].slice(0, 36));
  }, [cloneLayers, layers]);

  const commitLayers = useCallback(
    (next: TextLayer[]) => {
      pushHistory();
      setLayers(next.map((layer) => ({ ...layer })));
      if (exportUrl) {
        URL.revokeObjectURL(exportUrl);
        setExportUrl(null);
      }
    },
    [exportUrl, pushHistory]
  );

  const makeInitialLayers = useCallback((gif: DecodedGif) => {
    const first = createDefaultLayer(gif.width, gif.height, 1);
    first.endFrame = gif.frames.length - 1;
    return [first];
  }, []);

  const loadBuffer = useCallback(
    async (buffer: ArrayBuffer, sourceLabel: string) => {
      setIsDecoding(true);
      setIsPlaying(false);
      setStatus({ kind: "info", message: "Decoding GIF frames locally in this browser..." });
      setExportState(null);
      if (exportUrl) {
        URL.revokeObjectURL(exportUrl);
        setExportUrl(null);
      }
      try {
        const gif = await decodeGifBuffer(buffer);
        const initialLayers = makeInitialLayers(gif);
        setDecoded(gif);
        setLayers(initialLayers);
        setHistory([]);
        setSelectedLayerId(initialLayers[0]?.id ?? null);
        setCurrentFrame(0);
        setStatus({
          kind: "info",
          message: `${sourceLabel} loaded: ${gif.width} x ${gif.height}, ${gif.frames.length} frames, ${formatMs(
            gif.durationMs
          )}.`
        });
      } catch (error) {
        setDecoded(null);
        setLayers([]);
        setSelectedLayerId(null);
        setCurrentFrame(0);
        setStatus({
          kind: "error",
          message: error instanceof Error ? error.message : "Could not load this GIF."
        });
      } finally {
        setIsDecoding(false);
      }
    },
    [exportUrl, makeInitialLayers]
  );

  const handleFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      const looksLikeGif = file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
      if (!looksLikeGif) {
        setStatus({ kind: "error", message: "Choose a .gif file. Other image formats are not supported here." });
        return;
      }
      if (file.size > GIF_LIMITS.maxFileBytes) {
        setStatus({
          kind: "error",
          message: `This file is larger than the tested ${formatBytes(GIF_LIMITS.maxFileBytes)} limit.`
        });
        return;
      }
      await loadBuffer(await file.arrayBuffer(), "GIF");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [loadBuffer]
  );

  const loadSample = useCallback(async () => {
    setStatus({ kind: "info", message: "Loading the safe sample GIF..." });
    const response = await fetch("/sample-orbit.gif", { cache: "no-store" });
    if (!response.ok) {
      setStatus({ kind: "error", message: "The sample GIF could not be loaded." });
      return;
    }
    await loadBuffer(await response.arrayBuffer(), "Sample GIF");
  }, [loadBuffer]);

  const updateSelectedLayer = useCallback(
    (patch: Partial<TextLayer>) => {
      if (!decoded || !selectedLayer) return;
      const next = layers.map((layer) => {
        if (layer.id !== selectedLayer.id) return layer;
        const updated = clampFrameRange(clampLayerToCanvas({ ...layer, ...patch }, decoded.width, decoded.height), frameCount);
        return updated;
      });
      commitLayers(next);
    },
    [commitLayers, decoded, frameCount, layers, selectedLayer]
  );

  const setLayersWithoutHistory = useCallback((next: TextLayer[]) => {
    setLayers(next.map((layer) => ({ ...layer })));
  }, []);

  const addLayer = useCallback(() => {
    if (!decoded) return;
    const nextLayer = createDefaultLayer(decoded.width, decoded.height, layers.length + 1);
    nextLayer.endFrame = decoded.frames.length - 1;
    const next = [...layers, nextLayer];
    commitLayers(next);
    setSelectedLayerId(nextLayer.id);
  }, [commitLayers, decoded, layers]);

  const deleteLayer = useCallback(
    (id: string) => {
      if (layers.length <= 1) {
        setStatus({ kind: "error", message: "Keep at least one text layer. Use Reset to start over." });
        return;
      }
      const next = layers.filter((layer) => layer.id !== id);
      commitLayers(next);
      if (selectedLayerId === id) {
        setSelectedLayerId(next[0]?.id ?? null);
      }
    },
    [commitLayers, layers, selectedLayerId]
  );

  const moveLayer = useCallback(
    (id: string, direction: -1 | 1) => {
      const index = layers.findIndex((layer) => layer.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= layers.length) return;
      const next = [...layers];
      [next[index], next[target]] = [next[target], next[index]];
      commitLayers(next);
    },
    [commitLayers, layers]
  );

  const undo = useCallback(() => {
    const [previous, ...rest] = history;
    if (!previous) return;
    setLayers(cloneLayers(previous));
    setHistory(rest);
    if (!previous.some((layer) => layer.id === selectedLayerId)) {
      setSelectedLayerId(previous[0]?.id ?? null);
    }
    setStatus({ kind: "info", message: "Undid the last layer change." });
  }, [cloneLayers, history, selectedLayerId]);

  const reset = useCallback(() => {
    if (!decoded) return;
    const initialLayers = makeInitialLayers(decoded);
    pushHistory();
    setLayers(initialLayers);
    setSelectedLayerId(initialLayers[0]?.id ?? null);
    setCurrentFrame(0);
    setIsPlaying(false);
    if (exportUrl) {
      URL.revokeObjectURL(exportUrl);
      setExportUrl(null);
    }
    setStatus({ kind: "info", message: "Editor reset for this GIF." });
  }, [decoded, exportUrl, makeInitialLayers, pushHistory]);

  const exportGif = useCallback(async () => {
    if (!decoded) return;
    const controller = new AbortController();
    exportController.current = controller;
    if (exportUrl) {
      URL.revokeObjectURL(exportUrl);
      setExportUrl(null);
    }
    setExportState({ progress: 0, message: "Preparing export..." });
    setStatus({ kind: "info", message: "Exporting animated GIF locally in this browser..." });
    try {
      const renderFrame = createCanvasFrameRenderer(decoded.width, decoded.height);
      const blob = await encodeEditedGif(decoded, layers, {
        signal: controller.signal,
        renderFrame,
        onProgress: (progress) => {
          setExportState({
            progress: Math.round(progress.progress * 100),
            message: progress.message
          });
        }
      });
      const url = URL.createObjectURL(blob);
      setExportUrl(url);
      setStatus({
        kind: "info",
        message: `Export ready: ${formatBytes(blob.size)} animated GIF at ${decoded.width} x ${decoded.height}.`
      });
    } catch (error) {
      setStatus({
        kind: error instanceof DOMException && error.name === "AbortError" ? "info" : "error",
        message:
          error instanceof DOMException && error.name === "AbortError"
            ? "Export canceled."
            : error instanceof Error
              ? error.message
              : "The GIF export failed."
      });
    } finally {
      exportController.current = null;
      setExportState(null);
    }
  }, [decoded, exportUrl, layers]);

  const cancelExport = useCallback(() => {
    exportController.current?.abort();
  }, []);

  useEffect(() => {
    return () => {
      if (exportUrl) URL.revokeObjectURL(exportUrl);
    };
  }, [exportUrl]);

  useEffect(() => {
    if (!decoded || !isPlaying) return;
    const delay = decoded.frames[currentFrame]?.delayMs ?? 100;
    const timer = window.setTimeout(() => {
      setCurrentFrame((frame) => (frame + 1) % decoded.frames.length);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [currentFrame, decoded, isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !decoded) return;
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const frame = decoded.frames[currentFrame];
    ctx.clearRect(0, 0, decoded.width, decoded.height);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.rgba), decoded.width, decoded.height), 0, 0);
    for (const layer of getActiveLayers(layers, currentFrame)) {
      drawTextLayerOnCanvas(ctx, layer);
    }
  }, [currentFrame, decoded, layers]);

  const pointerToImage = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!decoded || !canvasRef.current) return null;
      const rect = canvasRef.current.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * decoded.width,
        y: ((event.clientY - rect.top) / rect.height) * decoded.height
      };
    },
    [decoded]
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!decoded) return;
      const point = pointerToImage(event);
      if (!point) return;
      const active = getActiveLayers(layers, currentFrame);
      const target = [...active].reverse().find((layer) => pointHitsLayer(layer, point.x, point.y));
      if (!target) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setSelectedLayerId(target.id);
      pushHistory();
      dragRef.current = {
        id: target.id,
        offsetX: point.x - target.x,
        offsetY: point.y - target.y
      };
    },
    [currentFrame, decoded, layers, pointerToImage, pushHistory]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!decoded || !dragRef.current) return;
      const point = pointerToImage(event);
      if (!point) return;
      const drag = dragRef.current;
      const next = layers.map((layer) =>
        layer.id === drag.id
          ? clampLayerToCanvas(
              {
                ...layer,
                x: point.x - drag.offsetX,
                y: point.y - drag.offsetY
              },
              decoded.width,
              decoded.height
            )
          : layer
      );
      setLayersWithoutHistory(next);
    },
    [decoded, layers, pointerToImage, setLayersWithoutHistory]
  );

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <div className="editor-shell">
      <section className="workspace-panel" aria-label="GIF preview and export">
        <div className="panel-header">
          <div className="panel-title">
            <h2>GIF Workspace</h2>
            <span>{decoded ? `${decoded.width} x ${decoded.height} - ${frameCount} frames` : "Load a GIF to begin"}</span>
          </div>
          <div className="panel-actions">
            <input
              ref={fileInputRef}
              className="input-hidden"
              id="gif-upload"
              type="file"
              accept="image/gif,.gif"
              onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
            />
            <label className="file-button" htmlFor="gif-upload">
              <Upload aria-hidden="true" />
              Upload GIF
            </label>
            <button className="btn btn-blue" type="button" onClick={() => void loadSample()} disabled={isDecoding}>
              <ImageIcon aria-hidden="true" />
              Sample
            </button>
            <button className="icon-button" data-tooltip="Undo" title="Undo" type="button" onClick={undo} disabled={!history.length}>
              <Undo2 aria-hidden="true" />
              <span className="sr-only">Undo</span>
            </button>
            <button className="icon-button" data-tooltip="Reset" title="Reset" type="button" onClick={reset} disabled={!decoded}>
              <RotateCcw aria-hidden="true" />
              <span className="sr-only">Reset</span>
            </button>
            {exportState ? (
              <button className="btn btn-danger" type="button" onClick={cancelExport}>
                <X aria-hidden="true" />
                Cancel
              </button>
            ) : (
              <button className="btn btn-primary" type="button" onClick={() => void exportGif()} disabled={!decoded || isDecoding}>
                <Download aria-hidden="true" />
                Export GIF
              </button>
            )}
          </div>
        </div>

        <div className="preview-wrap">
          <div className={`preview-stage ${decoded ? "" : "is-empty"}`}>
            {decoded ? (
              <canvas
                ref={canvasRef}
                className={`preview-canvas ${dragRef.current ? "is-dragging" : ""}`}
                aria-label="Animated GIF preview"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            ) : (
              <div className="empty-state">
                <Type aria-hidden="true" size={44} />
                <strong>Upload an animated GIF or try the sample.</strong>
                <span>Files are decoded locally and stay in this browser.</span>
              </div>
            )}
          </div>
        </div>

        <div className="timeline">
          <button
            className="icon-button"
            data-tooltip={isPlaying ? "Pause preview" : "Play preview"}
            title={isPlaying ? "Pause preview" : "Play preview"}
            type="button"
            onClick={() => setIsPlaying((value) => !value)}
            disabled={!decoded || frameCount < 2}
          >
            {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            <span className="sr-only">{isPlaying ? "Pause preview" : "Play preview"}</span>
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0, frameCount - 1)}
            value={currentFrame}
            onChange={(event) => setCurrentFrame(Number(event.target.value))}
            disabled={!decoded}
            aria-label="Preview frame"
          />
          <span className="time-readout">
            {decoded ? `Frame ${currentFrame + 1}/${frameCount} - ${formatMs(frameTime)}` : "No GIF loaded"}
          </span>
        </div>

        <div className="status-row" aria-live="polite">
          <span className={`status-message ${status.kind === "error" ? "error" : ""}`}>{status.message}</span>
          {exportState ? (
            <div className="progress" aria-label="Export progress">
              <div className="progress-bar" style={{ "--progress": `${exportState.progress}%` } as React.CSSProperties}>
                <span />
              </div>
              <span className="time-readout">{exportState.progress}%</span>
            </div>
          ) : exportUrl ? (
            <a className="download-link" href={exportUrl} download="add-text-to-gif.gif">
              <Download aria-hidden="true" />
              Download GIF
            </a>
          ) : null}
        </div>
      </section>

      <aside className="control-panel" aria-label="Text layer controls">
        <section className="control-section">
          <div className="section-heading">
            <h2>Text Layers</h2>
            <button className="icon-button" data-tooltip="Add layer" title="Add layer" type="button" onClick={addLayer} disabled={!decoded}>
              <Plus aria-hidden="true" />
              <span className="sr-only">Add layer</span>
            </button>
          </div>
          {decoded ? (
            <div className="layer-list">
              {layers.map((layer, index) => (
                <div className={`layer-item ${layer.id === selectedLayer?.id ? "is-selected" : ""}`} key={layer.id}>
                  <button className="layer-select" type="button" onClick={() => setSelectedLayerId(layer.id)}>
                    <span className="layer-name">
                      <strong>{layer.name}</strong>
                      <span>
                        Frames {layer.startFrame + 1}-{layer.endFrame + 1}: {layer.text || "Empty text"}
                      </span>
                    </span>
                  </button>
                  <div className="layer-tools">
                    <button
                      className="icon-button"
                      data-tooltip="Move up"
                      title="Move up"
                      type="button"
                      onClick={() => moveLayer(layer.id, -1)}
                      disabled={index === 0}
                    >
                      <ArrowUp aria-hidden="true" />
                      <span className="sr-only">Move layer up</span>
                    </button>
                    <button
                      className="icon-button"
                      data-tooltip="Move down"
                      title="Move down"
                      type="button"
                      onClick={() => moveLayer(layer.id, 1)}
                      disabled={index === layers.length - 1}
                    >
                      <ArrowDown aria-hidden="true" />
                      <span className="sr-only">Move layer down</span>
                    </button>
                    <button
                      className="icon-button"
                      data-tooltip="Delete"
                      title="Delete"
                      type="button"
                      onClick={() => deleteLayer(layer.id)}
                      disabled={layers.length <= 1}
                    >
                      <Trash2 aria-hidden="true" />
                      <span className="sr-only">Delete layer</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="field-note">Upload a GIF to create text layers.</p>
          )}
        </section>

        {decoded && selectedLayer ? (
          <>
            <section className="control-section">
              <div className="section-heading">
                <h2>Text</h2>
              </div>
              <div className="form-grid one">
                <div className="field">
                  <label htmlFor="layer-text">Layer text</label>
                  <textarea
                    id="layer-text"
                    value={selectedLayer.text}
                    onChange={(event) => updateSelectedLayer({ text: event.target.value })}
                    placeholder="Type caption text"
                  />
                </div>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="font-family">Font</label>
                  <select
                    id="font-family"
                    value={selectedLayer.fontFamily}
                    onChange={(event) => updateSelectedLayer({ fontFamily: event.target.value })}
                  >
                    {FONT_OPTIONS.map((option) => (
                      <option key={option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="font-weight">Weight</label>
                  <select
                    id="font-weight"
                    value={selectedLayer.fontWeight}
                    onChange={(event) => updateSelectedLayer({ fontWeight: event.target.value as TextLayer["fontWeight"] })}
                  >
                    <option value="400">Regular</option>
                    <option value="600">Semi bold</option>
                    <option value="700">Bold</option>
                    <option value="800">Heavy</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="font-size">Size</label>
                  <input
                    id="font-size"
                    type="number"
                    min={8}
                    max={220}
                    value={selectedLayer.fontSize}
                    onChange={(event) => updateSelectedLayer({ fontSize: Number(event.target.value) })}
                  />
                </div>
                <div className="field">
                  <span className="field-label">Align</span>
                  <div className="segmented" role="group" aria-label="Text alignment">
                    <AlignButton value="left" selected={selectedLayer.align} onSelect={(align) => updateSelectedLayer({ align })} />
                    <AlignButton value="center" selected={selectedLayer.align} onSelect={(align) => updateSelectedLayer({ align })} />
                    <AlignButton value="right" selected={selectedLayer.align} onSelect={(align) => updateSelectedLayer({ align })} />
                  </div>
                </div>
              </div>
            </section>

            <section className="control-section">
              <div className="section-heading">
                <h2>Position and Range</h2>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="pos-x">X</label>
                  <input
                    id="pos-x"
                    type="number"
                    value={Math.round(selectedLayer.x)}
                    onChange={(event) => updateSelectedLayer({ x: Number(event.target.value) })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="pos-y">Y</label>
                  <input
                    id="pos-y"
                    type="number"
                    value={Math.round(selectedLayer.y)}
                    onChange={(event) => updateSelectedLayer({ y: Number(event.target.value) })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="start-frame">Start frame</label>
                  <input
                    id="start-frame"
                    type="number"
                    min={1}
                    max={frameCount}
                    value={selectedLayer.startFrame + 1}
                    onChange={(event) => updateSelectedLayer({ startFrame: Number(event.target.value) - 1 })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="end-frame">End frame</label>
                  <input
                    id="end-frame"
                    type="number"
                    min={1}
                    max={frameCount}
                    value={selectedLayer.endFrame + 1}
                    onChange={(event) => updateSelectedLayer({ endFrame: Number(event.target.value) - 1 })}
                  />
                </div>
              </div>
              <p className="field-note">
                Drag the selected layer in the preview. Range times: {formatMs(getFrameStartMs(decoded, selectedLayer.startFrame))} to{" "}
                {formatMs(getFrameStartMs(decoded, Math.min(selectedLayer.endFrame + 1, frameCount - 1)))}.
              </p>
            </section>

            <section className="control-section">
              <div className="section-heading">
                <h2>Style</h2>
              </div>
              <div className="form-grid">
                <ColorField id="text-color" label="Text color" value={selectedLayer.color} onChange={(color) => updateSelectedLayer({ color })} />
                <ColorField
                  id="stroke-color"
                  label="Outline"
                  value={selectedLayer.strokeColor}
                  onChange={(strokeColor) => updateSelectedLayer({ strokeColor })}
                />
                <div className="field">
                  <label htmlFor="stroke-width">Outline width</label>
                  <input
                    id="stroke-width"
                    type="range"
                    min={0}
                    max={24}
                    value={selectedLayer.strokeWidth}
                    onChange={(event) => updateSelectedLayer({ strokeWidth: Number(event.target.value) })}
                  />
                  <p className="field-note">{selectedLayer.strokeWidth}px</p>
                </div>
                <div className="field">
                  <label htmlFor="opacity">Text opacity</label>
                  <input
                    id="opacity"
                    type="range"
                    min={0}
                    max={100}
                    value={selectedLayer.opacity}
                    onChange={(event) => updateSelectedLayer({ opacity: Number(event.target.value) })}
                  />
                  <p className="field-note">{selectedLayer.opacity}%</p>
                </div>
                <ColorField
                  id="shadow-color"
                  label="Shadow"
                  value={selectedLayer.shadowColor}
                  onChange={(shadowColor) => updateSelectedLayer({ shadowColor })}
                />
                <div className="field">
                  <label htmlFor="shadow-blur">Shadow blur</label>
                  <input
                    id="shadow-blur"
                    type="range"
                    min={0}
                    max={40}
                    value={selectedLayer.shadowBlur}
                    onChange={(event) => updateSelectedLayer({ shadowBlur: Number(event.target.value) })}
                  />
                  <p className="field-note">{selectedLayer.shadowBlur}px</p>
                </div>
                <div className="field">
                  <label htmlFor="shadow-x">Shadow X</label>
                  <input
                    id="shadow-x"
                    type="number"
                    value={selectedLayer.shadowOffsetX}
                    onChange={(event) => updateSelectedLayer({ shadowOffsetX: Number(event.target.value) })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="shadow-y">Shadow Y</label>
                  <input
                    id="shadow-y"
                    type="number"
                    value={selectedLayer.shadowOffsetY}
                    onChange={(event) => updateSelectedLayer({ shadowOffsetY: Number(event.target.value) })}
                  />
                </div>
                <ColorField
                  id="bg-color"
                  label="Background"
                  value={selectedLayer.backgroundColor}
                  onChange={(backgroundColor) => updateSelectedLayer({ backgroundColor })}
                />
                <div className="field">
                  <label htmlFor="bg-opacity">Background opacity</label>
                  <input
                    id="bg-opacity"
                    type="range"
                    min={0}
                    max={100}
                    value={selectedLayer.backgroundOpacity}
                    onChange={(event) => updateSelectedLayer({ backgroundOpacity: Number(event.target.value) })}
                  />
                  <p className="field-note">{selectedLayer.backgroundOpacity}%</p>
                </div>
              </div>
            </section>
          </>
        ) : (
          <section className="control-section">
            <h2>Ready for a GIF</h2>
            <p className="field-note">
              Upload a file or use the sample. The editor rejects files outside tested limits instead of freezing the page.
            </p>
          </section>
        )}
      </aside>
    </div>
  );
}

function AlignButton({
  value,
  selected,
  onSelect
}: {
  value: TextAlign;
  selected: TextAlign;
  onSelect: (value: TextAlign) => void;
}) {
  const Icon = value === "left" ? AlignLeft : value === "center" ? AlignCenter : AlignRight;
  return (
    <button className={selected === value ? "is-active" : ""} type="button" onClick={() => onSelect(value)} title={`Align ${value}`}>
      <Icon aria-hidden="true" />
      <span className="sr-only">Align {value}</span>
    </button>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="swatch-row">
        <input id={id} type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <input value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label} hex value`} />
      </div>
    </div>
  );
}
