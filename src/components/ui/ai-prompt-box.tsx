"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUp,
  Mic,
  Paperclip,
  Square,
  StopCircle,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// PromptInputBox — the dashboard composer.
//
// Original design comes from the "modern AI chat composer" spec:
//   * rounded-3xl card with deep soft shadow
//   * image thumbnails for pasted/dropped/picked files
//   * drag-and-drop on the whole card, paste-from-clipboard for images
//   * 240px-cap autosizing textarea
//   * animated mic/send icon swap (framer-motion)
//   * animated voice-recorder bars driven by a CSS keyframe (no per-frame
//     React rerender — see globals.css `@keyframes prompt-bar`)
//   * red-border loading state while the assistant is generating
//
// Search/Think/Canvas mode toggles from the original spec are intentionally
// dropped because the project has no backend behind them; the box just
// returns the raw message via `onSend(message, files)`.
// ---------------------------------------------------------------------------

const MAX_AUTOSIZE_PX = 240;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface PromptInputBoxProps {
  onSend?: (message: string, files?: File[]) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

export function PromptInputBox({
  onSend,
  isLoading = false,
  placeholder = "Ask anything…",
  className,
}: PromptInputBoxProps) {
  const [text, setText] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const hasContent = text.trim().length > 0 || files.length > 0;

  // ----- autosize ----------------------------------------------------------
  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_AUTOSIZE_PX);
    el.style.height = `${next}px`;
  }, [text]);

  // ----- file handling -----------------------------------------------------
  const processFile = React.useCallback((file: File | null | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return;
    setFiles((prev) => [...prev, file]);
  }, []);

  const removeFile = React.useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ----- drag and drop -----------------------------------------------------
  const onDragOver = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = Array.from(e.dataTransfer.files ?? []);
      if (dropped.length === 0) return;
      const image = dropped.find((f) => f.type.startsWith("image/"));
      processFile(image ?? dropped[0]);
    },
    [processFile],
  );

  // ----- paste from clipboard ---------------------------------------------
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const items = Array.from(e.clipboardData.items);
      const imgItem = items.find((it) => it.type.startsWith("image/"));
      if (!imgItem) return;
      e.preventDefault();
      processFile(imgItem.getAsFile());
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [processFile]);

  // ----- global "/" focus shortcut ----------------------------------------
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key === "/" && !inField) {
        e.preventDefault();
        textareaRef.current?.focus();
        return;
      }
      if (e.key === "Escape" && document.activeElement === textareaRef.current) {
        textareaRef.current?.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ----- submit ------------------------------------------------------------
  const submit = React.useCallback(() => {
    if (isLoading) return;
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) return;
    onSend?.(trimmed, files.length > 0 ? files : undefined);
    setText("");
    setFiles([]);
  }, [files, isLoading, onSend, text]);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );

  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <div
        className={cn(
          "relative w-full rounded-3xl border p-2 transition-colors",
          "bg-[hsl(var(--prompt-bg))] border-[hsl(var(--prompt-border))]",
          "text-[hsl(var(--prompt-fg))]",
          "shadow-[var(--prompt-shadow)]",
          isLoading && "border-destructive/70",
          isDragging && "ring-2 ring-[hsl(var(--prompt-border))]/60",
          className,
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {/* Attachments row */}
        <AnimatePresence initial={false}>
          {files.length > 0 ? (
            <motion.div
              key="attachments"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap gap-2 overflow-hidden px-2 pt-1 pb-2"
            >
              {files.map((f, i) => (
                <Attachment
                  key={`${f.name}-${i}`}
                  file={f}
                  onRemove={() => removeFile(i)}
                />
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Textarea OR voice recorder slot */}
        {isRecording ? (
          <VoiceRecorder onStop={() => setIsRecording(false)} />
        ) : (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={1}
            className={cn(
              "block w-full resize-none border-0 bg-transparent px-3 py-2",
              "text-sm leading-relaxed",
              "text-[hsl(var(--prompt-fg))] placeholder:text-[hsl(var(--prompt-muted))]",
              "min-h-[44px] max-h-60 focus:outline-none",
            )}
          />
        )}

        {/* Actions row */}
        <div className="mt-1 flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1">
            <TooltipPrimitive.Root>
              <TooltipPrimitive.Trigger asChild>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isRecording}
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-full",
                    "text-[hsl(var(--prompt-muted))] transition-colors",
                    "hover:bg-[hsl(var(--prompt-elevated))] hover:text-[hsl(var(--prompt-fg))]",
                    "disabled:opacity-50 disabled:hover:bg-transparent",
                  )}
                  aria-label="Attach image"
                >
                  <Paperclip className="size-4" />
                </button>
              </TooltipPrimitive.Trigger>
              <TooltipContent>Attach image</TooltipContent>
            </TooltipPrimitive.Root>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                processFile(f);
                e.target.value = "";
              }}
            />
          </div>

          <div className="flex items-center gap-1">
            <TooltipPrimitive.Root>
              <TooltipPrimitive.Trigger asChild>
                <button
                  type="button"
                  onClick={() => setIsRecording((r) => !r)}
                  disabled={isLoading}
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-full",
                    "text-[hsl(var(--prompt-muted))] transition-colors",
                    "hover:bg-[hsl(var(--prompt-elevated))] hover:text-[hsl(var(--prompt-fg))]",
                    isRecording && "text-destructive hover:text-destructive",
                    "disabled:opacity-50 disabled:hover:bg-transparent",
                  )}
                  aria-label={isRecording ? "Stop recording" : "Voice message"}
                >
                  {isRecording ? (
                    <StopCircle className="size-4" />
                  ) : (
                    <Mic className="size-4" />
                  )}
                </button>
              </TooltipPrimitive.Trigger>
              <TooltipContent>
                {isRecording ? "Stop recording" : "Voice message"}
              </TooltipContent>
            </TooltipPrimitive.Root>

            <TooltipPrimitive.Root>
              <TooltipPrimitive.Trigger asChild>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!isLoading && !hasContent}
                  className={cn(
                    "relative inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                    isLoading
                      ? "bg-destructive/15 text-destructive"
                      : hasContent
                        ? "bg-[hsl(var(--prompt-send-bg))] text-[hsl(var(--prompt-send-fg))] hover:opacity-90"
                        : "bg-transparent text-[hsl(var(--prompt-muted))]",
                    "disabled:cursor-not-allowed",
                  )}
                  aria-label={isLoading ? "Stop generation" : "Send (Enter)"}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={
                        isLoading ? "stop" : hasContent ? "send" : "idle"
                      }
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center justify-center"
                    >
                      {isLoading ? (
                        <Square className="size-3.5 animate-pulse" />
                      ) : hasContent ? (
                        <ArrowUp className="size-4" />
                      ) : (
                        <Mic className="size-4" />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </button>
              </TooltipPrimitive.Trigger>
              <TooltipContent>
                {isLoading ? "Stop generation" : "Send (Enter)"}
              </TooltipContent>
            </TooltipPrimitive.Root>
          </div>
        </div>
      </div>
    </TooltipPrimitive.Provider>
  );
}

// ---------------------------------------------------------------------------
// Attachment chip / thumbnail
// ---------------------------------------------------------------------------
function Attachment({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const isImage = file.type.startsWith("image/");
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  if (isImage && previewUrl) {
    return (
      <div className="group relative">
        <ImageViewDialog src={previewUrl} alt={file.name}>
          <button
            type="button"
            className="block size-16 overflow-hidden rounded-xl border border-[hsl(var(--prompt-border))]"
            aria-label={`Preview ${file.name}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={file.name}
              className="size-full object-cover"
            />
          </button>
        </ImageViewDialog>
        <RemoveButton onClick={onRemove} />
      </div>
    );
  }

  return (
    <div className="group relative inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--prompt-border))] bg-[hsl(var(--prompt-elevated))] py-1.5 pr-7 pl-2.5 text-xs text-[hsl(var(--prompt-fg))]">
      <Paperclip className="size-3.5 text-[hsl(var(--prompt-muted))]" />
      <span className="max-w-[160px] truncate">{file.name}</span>
      <RemoveButton onClick={onRemove} />
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove attachment"
      className={cn(
        "absolute -right-1.5 -top-1.5 inline-flex size-5 items-center justify-center rounded-full",
        "bg-[hsl(var(--prompt-fg))] text-[hsl(var(--prompt-bg))]",
        "shadow-sm opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100",
      )}
    >
      <X className="size-3" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Voice recorder UI (visual only — no STT)
// ---------------------------------------------------------------------------
function VoiceRecorder({ onStop }: { onStop: () => void }) {
  const [time, setTime] = React.useState(0);

  React.useEffect(() => {
    const handle: ReturnType<typeof setInterval> = setInterval(() => {
      setTime((t) => t + 1);
    }, 1000);
    return () => clearInterval(handle);
  }, []);

  return (
    <div className="flex w-full flex-col items-center gap-2 py-3">
      <div className="flex items-center gap-2 font-mono text-xs text-[hsl(var(--prompt-muted))]">
        <span className="size-2 animate-pulse rounded-full bg-destructive" />
        {formatTime(time)}
        <button
          type="button"
          onClick={onStop}
          className="ml-1 text-[hsl(var(--prompt-fg))] underline-offset-2 hover:underline"
        >
          stop
        </button>
      </div>
      <div className="flex h-10 items-center gap-[2px]">
        {Array.from({ length: 32 }).map((_, i) => (
          <span
            key={i}
            className="w-[2px] origin-center rounded-full bg-[hsl(var(--prompt-fg))]/70"
            style={{
              animation: `prompt-bar ${0.5 + (i % 6) * 0.07}s ease-in-out ${i * 0.04}s infinite`,
              height: `${Math.max(6, ((i * 7) % 20) + 8)}px`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ---------------------------------------------------------------------------
// Image preview dialog (radix)
// ---------------------------------------------------------------------------
function ImageViewDialog({
  children,
  src,
  alt,
}: {
  children: React.ReactNode;
  src: string;
  alt: string;
}) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>{children}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 grid w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 gap-4 p-4",
            "bg-[hsl(var(--prompt-bg))] rounded-2xl border border-[hsl(var(--prompt-border))]",
            "shadow-[var(--prompt-shadow)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {alt}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Image preview
          </DialogPrimitive.Description>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-h-[80vh] w-full rounded-xl object-contain"
          />
          <DialogPrimitive.Close
            className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-full bg-[hsl(var(--prompt-elevated))] text-[hsl(var(--prompt-fg))]"
            aria-label="Close preview"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Tooltip content shim — keeps the call sites tidy.
// ---------------------------------------------------------------------------
function TooltipContent({ children }: { children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={6}
        className={cn(
          "z-50 select-none rounded-md px-2 py-1 text-xs",
          "bg-[hsl(var(--prompt-fg))] text-[hsl(var(--prompt-bg))]",
          "shadow-md",
          "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0",
        )}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-[hsl(var(--prompt-fg))]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
