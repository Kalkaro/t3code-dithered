import type { CSSProperties } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";

import {
  BASE16_KEYS,
  BASE16_ROLE_HINTS,
  MAX_BACKDROP_DIM,
  MAX_DITHER_GRAIN,
  MAX_DITHER_LEVELS,
  MAX_DITHER_PIXEL_SIZE,
  MAX_IMAGE_DARKEN,
  MAX_SURFACE_OPACITY,
  MIN_BACKDROP_DIM,
  MIN_DITHER_GRAIN,
  MIN_DITHER_LEVELS,
  MIN_DITHER_PIXEL_SIZE,
  MIN_IMAGE_DARKEN,
  MIN_SURFACE_OPACITY,
  type Base16Key,
} from "../../base16";
import { useBase16Actions, useBase16State } from "../../hooks/useBase16";
import { getBase16BackgroundStatus, subscribeToBase16BackgroundStatus } from "../Base16Background";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { toastManager } from "../ui/toast";
import { searchableSetting } from "./settingsSearch";
import { SettingResetButton, SettingsRow, SettingsSection } from "./settingsLayout";

export function Base16SettingsSection() {
  const state = useBase16State();
  const actions = useBase16Actions();

  return (
    <SettingsSection id="base16" title="Base16 & background">
      <SettingsRow
        {...searchableSetting("base16-colors")}
        description="Paint every surface with sixteen base colors: base00 backgrounds instead of gray, base05 text, base0D accents. Each role can independently use any palette slot."
        resetAction={
          state.enabled ? (
            <SettingResetButton label="Base16 colors" onClick={() => actions.setEnabled(false)} />
          ) : null
        }
        control={
          <Switch
            checked={state.enabled}
            onCheckedChange={(checked) => actions.setEnabled(Boolean(checked))}
            aria-label="Base16 colors"
          />
        }
      >
        {state.enabled ? (
          <div className="pt-3 pb-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BASE16_KEYS.map((key) => (
                <Base16SlotField
                  key={key}
                  slotKey={key}
                  value={state.palette[key]}
                  onCommit={(raw) => actions.setSlot(key, raw)}
                  source={state.slotSources[key]}
                  onSourceChange={(source) => actions.setSlotSource(key, source)}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Disabling restores the previously selected theme.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  actions.resetPalette();
                  toastManager.add({
                    type: "success",
                    title: "Palette reset",
                    description: "The colors and role assignments are back to their defaults.",
                  });
                }}
              >
                Reset palette
              </Button>
            </div>
          </div>
        ) : null}
      </SettingsRow>

      {state.enabled ? <BackgroundSettingsRow /> : null}
    </SettingsSection>
  );
}

function Base16SlotSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Base16Key;
  onChange: (value: Base16Key) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as Base16Key)}>
      <SelectTrigger size="xs" className="min-w-0 flex-1 font-mono" aria-label={label}>
        <SelectValue>{value}</SelectValue>
      </SelectTrigger>
      <SelectPopup alignItemWithTrigger={false} matchTriggerWidth={false}>
        {BASE16_KEYS.map((key) => (
          <SelectItem key={key} value={key} className="font-mono text-xs">
            {key}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

function Base16SlotField({
  slotKey,
  value,
  onCommit,
  source,
  onSourceChange,
}: {
  slotKey: Base16Key;
  value: string;
  onCommit: (raw: string) => boolean;
  source: Base16Key;
  onSourceChange: (source: Base16Key) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    onCommit(draft);
    // Always fall back to the stored value: valid input already matches it,
    // invalid input is reverted.
    setDraft(null);
  };

  return (
    <div className="grid gap-1.5 rounded-lg border border-border/60 bg-card/40 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onCommit(event.target.value)}
          aria-label={`${slotKey} color picker (${BASE16_ROLE_HINTS[slotKey]})`}
          className="size-7 shrink-0 cursor-pointer rounded border border-border/60 bg-transparent p-0"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-xs font-medium text-foreground">{slotKey}</span>
          <input
            value={draft ?? value}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
            aria-label={`${slotKey} hex value (${BASE16_ROLE_HINTS[slotKey]})`}
            spellCheck={false}
            autoComplete="off"
            className="w-full bg-transparent font-mono text-xs text-muted-foreground outline-none"
          />
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-[11px] text-muted-foreground">Use</span>
        <Base16SlotSelect
          label={`${slotKey} color source`}
          value={source}
          onChange={onSourceChange}
        />
      </div>
    </div>
  );
}

function sliderStyle(value: number, minimum: number, maximum: number): CSSProperties {
  const ratio = maximum === minimum ? 0 : (value - minimum) / (maximum - minimum);
  return {
    "--settings-slider-progress": `${ratio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - ratio}rem`,
  } as CSSProperties;
}

function BackgroundSettingsRow() {
  const state = useBase16State();
  const actions = useBase16Actions();
  const background = state.background;
  const [urlDraft, setUrlDraft] = useState(background.imageUrl);
  const [busy, setBusy] = useState<"url" | "random" | null>(null);

  // Another tab may change the stored URL; keep the draft honest without
  // clobbering an in-progress edit.
  useEffect(() => {
    if (busy === null) setUrlDraft(background.imageUrl);
  }, [background.imageUrl, busy]);

  const applyUrl = async () => {
    setBusy("url");
    try {
      await actions.applyImageUrl(urlDraft);
      toastManager.add({
        type: "success",
        title: "Background updated",
        description: "The image and its Pywal Base16 palette are live.",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not set background",
        description: error instanceof Error ? error.message : "Update failed.",
      });
    } finally {
      setBusy(null);
    }
  };

  const applyRandom = async () => {
    setBusy("random");
    try {
      const resolved = await actions.applyRandomKonachanImage(background.konachanTags);
      setUrlDraft(resolved.imageUrl);
      toastManager.add({
        type: "success",
        title: "Background updated",
        description: "The Konachan wallpaper and its Pywal Base16 palette are live.",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not fetch a wallpaper",
        description: error instanceof Error ? error.message : "Update failed.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsRow
      {...searchableSetting("custom-background")}
      description="Show an image behind the interface and generate its Base16 palette with Pywal. Paste a direct image link or a Konachan post link, or roll a random safe wallpaper."
      control={
        background.imageUrl ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              actions.clearImage();
              setUrlDraft("");
            }}
          >
            Remove
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-3 pt-3 pb-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="bg-background"
            placeholder="https://…/wallpaper.png or konachan.net/post/show/…"
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void applyUrl();
            }}
            aria-label="Background image URL"
            spellCheck={false}
            autoComplete="off"
          />
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => void applyUrl()} disabled={busy !== null}>
              {busy === "url" ? "Generating…" : "Set background"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void applyRandom()}
              disabled={busy !== null}
            >
              {busy === "random" ? "Generating…" : "Surprise me"}
            </Button>
          </div>
        </div>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-foreground">
            Konachan tags for “Surprise me”
          </span>
          <Input
            className="bg-background"
            placeholder="sky clouds — safe only, appended to order:random"
            value={background.konachanTags}
            onChange={(event) => actions.setBackground({ konachanTags: event.target.value })}
            aria-label="Konachan tags"
            spellCheck={false}
            autoComplete="off"
          />
        </label>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-foreground">Dithering</p>
            <p className="text-xs text-muted-foreground">
              Bayer ordered dither with monochrome grain, like palettegen. Images load through this
              server, so Konachan links dither too.
            </p>
            <BackgroundRenderStatus />
          </div>
          <Switch
            checked={background.ditherEnabled}
            onCheckedChange={(checked) =>
              actions.setBackground({ ditherEnabled: Boolean(checked) })
            }
            aria-label="Dithering"
          />
        </div>

        {background.ditherEnabled ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <DitherSlider
              id="base16-dither-levels"
              label="Color levels"
              min={MIN_DITHER_LEVELS}
              max={MAX_DITHER_LEVELS}
              step={1}
              value={background.ditherLevels}
              format={(value) => `${value}`}
              onChange={(value) => actions.setBackground({ ditherLevels: value })}
            />
            <DitherSlider
              id="base16-dither-grain"
              label="Grain"
              min={MIN_DITHER_GRAIN}
              max={MAX_DITHER_GRAIN}
              step={1}
              value={background.ditherGrain}
              format={(value) => `${value}%`}
              onChange={(value) => actions.setBackground({ ditherGrain: value })}
            />
            <DitherSlider
              id="base16-dither-pixel-size"
              label="Pixel size"
              min={MIN_DITHER_PIXEL_SIZE}
              max={MAX_DITHER_PIXEL_SIZE}
              step={1}
              value={background.ditherPixelSize}
              format={(value) => `${value}`}
              onChange={(value) => actions.setBackground({ ditherPixelSize: value })}
            />
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-3">
          <DitherSlider
            id="base16-backdrop-dim"
            label="Backdrop veil"
            description="Page and sidebar tint. Set to 0 to remove it entirely."
            min={MIN_BACKDROP_DIM}
            max={MAX_BACKDROP_DIM}
            step={1}
            value={background.backdropDim}
            format={(value) => `${value}%`}
            onChange={(value) => actions.setBackground({ backdropDim: value })}
          />
          <DitherSlider
            id="base16-image-darken"
            label="Darken image"
            description="Black overlay on the wallpaper itself, veil not needed."
            min={MIN_IMAGE_DARKEN}
            max={MAX_IMAGE_DARKEN}
            step={1}
            value={background.imageDarken}
            format={(value) => `${value}%`}
            onChange={(value) => actions.setBackground({ imageDarken: value })}
          />
          <DitherSlider
            id="base16-surface-opacity"
            label="Surface solidity"
            description="Cards, composer, and controls."
            min={MIN_SURFACE_OPACITY}
            max={MAX_SURFACE_OPACITY}
            step={1}
            value={background.surfaceOpacity}
            format={(value) => `${value}%`}
            onChange={(value) => actions.setBackground({ surfaceOpacity: value })}
          />
        </div>
      </div>
    </SettingsRow>
  );
}

function BackgroundRenderStatus() {
  const status = useSyncExternalStore(
    subscribeToBase16BackgroundStatus,
    getBase16BackgroundStatus,
    getBase16BackgroundStatus,
  );
  if (status.phase === "idle") return null;
  if (status.phase === "loading") {
    return <p className="pt-1 text-xs text-muted-foreground">Rendering background…</p>;
  }
  if (status.mode === "dithered") {
    return (
      <p className="pt-1 text-xs text-muted-foreground">
        Dithered{status.detail ? ` (${status.detail})` : ""}.
      </p>
    );
  }
  return (
    <p className="pt-1 text-xs text-muted-foreground">
      Showing the original{status.detail ? ` (${status.detail})` : ""}.
    </p>
  );
}

function DitherSlider({
  id,
  label,
  description,
  min,
  max,
  step,
  value,
  format,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label
      className="grid gap-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5"
      htmlFor={id}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <output className="min-w-10 rounded-md bg-muted px-2 py-0.5 text-center font-mono text-xs font-medium tabular-nums text-foreground">
          {format(value)}
        </output>
      </span>
      {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      <input
        aria-label={label}
        className="settings-slider min-w-0 flex-1"
        id={id}
        min={min}
        max={max}
        step={step}
        style={sliderStyle(value, min, max)}
        type="range"
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isInteger(next) && next >= min && next <= max) onChange(next);
        }}
      />
    </label>
  );
}
