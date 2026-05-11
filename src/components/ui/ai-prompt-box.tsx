"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowUp,
  Paperclip,
  Square,
  X,
  StopCircle,
  Mic,
  Globe,
  BrainCog,
  FolderCode,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────────
// Textarea
// ───────────────────────────────────────────────────────────────────────────

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex w-full rounded-md border-none bg-transparent px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

// ───────────────────────────────────────────────────────────────────────────
// Tooltip
// ───────────────────────────────────────────────────────────────────────────

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground shadow-md animate-in fade-in-0 zoom-in-95",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// ───────────────────────────────────────────────────────────────────────────
// Dialog
// ───────────────────────────────────────────────────────────────────────────

const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;
const DialogTitle = DialogPrimitive.Title;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 grid w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 gap-4 border border-border bg-card p-0 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-3 top-3 rounded-sm bg-card/70 p-1 text-foreground opacity-80 transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none">
        <X className="h-5 w-5" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

// ───────────────────────────────────────────────────────────────────────────
// Inline Button (kept local — distinct visual treatment from project Button)
// ───────────────────────────────────────────────────────────────────────────

type ButtonVariant = "default" | "outline" | "ghost";
type ButtonSize = "default" | "sm" | "icon";

interface PromptButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const PromptButton = React.forwardRef<HTMLButtonElement, PromptButtonProps>(
  (
    { className, variant = "default", size = "default", type = "button", ...props },
    ref,
  ) => {
    const base =
      "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
    const variants: Record<ButtonVariant, string> = {
      default:
        "bg-primary text-primary-foreground hover:bg-primary/90",
      outline:
        "border border-border bg-transparent hover:bg-accent text-foreground",
      ghost: "hover:bg-accent text-foreground",
    };
    const sizes: Record<ButtonSize, string> = {
      default: "h-9 px-4 py-2",
      sm: "h-8 rounded-md px-3",
      icon: "h-8 w-8",
    };
    return (
      <button
        ref={ref}
        type={type}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  },
);
PromptButton.displayName = "PromptButton";

// ───────────────────────────────────────────────────────────────────────────
// VoiceRecorder
// ───────────────────────────────────────────────────────────────────────────

interface VoiceRecorderProps {
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: (durationSec: number) => void;
  visualizerBars?: number;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  isRecording,
  onStartRecording,
  onStopRecording,
  visualizerBars = 32,
}) => {
  const [time, setTime] = React.useState(0);

  React.useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isRecording) {
      onStartRecording();
      setTime(0);
      interval = setInterval(() => setTime((t) => t + 1), 1000);
    } else if (interval) {
      clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  return (
    <div className="flex w-full flex-col items-center gap-2 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onStopRecording(time)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-foreground transition-colors hover:bg-accent/80"
          aria-label="Stop recording"
        >
          <StopCircle className="h-4 w-4" />
        </button>
        <span className="font-mono text-xs text-muted-foreground">
          {formatTime(time)}
        </span>
        <div className="flex h-6 items-end gap-[2px]">
          {Array.from({ length: visualizerBars }).map((_, i) => (
            <span
              key={i}
              className="w-[2px] rounded bg-foreground/70"
              style={{
                height: `${
                  isRecording
                    ? 4 + (Math.sin((Date.now() / 200 + i) % Math.PI) + 1) * 6
                    : 4
                }px`,
              }}
            />
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Recording — tap to stop
      </p>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// ImageViewDialog
// ───────────────────────────────────────────────────────────────────────────

interface ImageViewDialogProps {
  imageUrl: string | null;
  onClose: () => void;
}

const ImageViewDialog: React.FC<ImageViewDialogProps> = ({
  imageUrl,
  onClose,
}) => {
  if (!imageUrl) return null;
  return (
    <Dialog open={Boolean(imageUrl)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-2">
        <DialogTitle className="sr-only">Attached image preview</DialogTitle>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Attached preview"
          className="h-full max-h-[80vh] w-full rounded-md object-contain"
        />
      </DialogContent>
    </Dialog>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// PromptInput context primitives
// ───────────────────────────────────────────────────────────────────────────

interface PromptInputContextValue {
  value: string;
  setValue: (v: string) => void;
  isLoading: boolean;
  onSubmit: () => void;
  disabled: boolean;
}

const PromptInputContext = React.createContext<PromptInputContextValue | null>(
  null,
);

function usePromptInput(): PromptInputContextValue {
  const ctx = React.useContext(PromptInputContext);
  if (!ctx) {
    throw new Error("usePromptInput must be used inside <PromptInput>");
  }
  return ctx;
}

interface PromptInputProps {
  value: string;
  onValueChange: (v: string) => void;
  isLoading: boolean;
  onSubmit: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

function PromptInput({
  value,
  onValueChange,
  isLoading,
  onSubmit,
  disabled,
  className,
  children,
}: PromptInputProps) {
  const ctx = React.useMemo<PromptInputContextValue>(
    () => ({
      value,
      setValue: onValueChange,
      isLoading,
      onSubmit,
      disabled: Boolean(disabled),
    }),
    [value, onValueChange, isLoading, onSubmit, disabled],
  );

  return (
    <PromptInputContext.Provider value={ctx}>
      <div
        className={cn(
          "flex w-full flex-col rounded-2xl border border-border bg-card text-foreground shadow-sm transition-colors focus-within:border-border/80",
          className,
        )}
      >
        {children}
      </div>
    </PromptInputContext.Provider>
  );
}

interface PromptInputTextareaProps {
  placeholder?: string;
  className?: string;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
}

function PromptInputTextarea({
  placeholder,
  className,
  textareaRef,
}: PromptInputTextareaProps) {
  const { value, setValue, onSubmit, disabled } = usePromptInput();
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useImperativeHandle(textareaRef, () => innerRef.current!, []);

  // Auto-grow up to ~6 lines
  React.useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, 144);
    el.style.height = `${next}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim().length > 0) onSubmit();
    }
  };

  return (
    <Textarea
      ref={innerRef}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      rows={1}
      className={cn(
        "max-h-36 min-h-[44px] resize-none px-4 py-3 text-sm leading-relaxed",
        className,
      )}
    />
  );
}

interface PromptInputActionsProps {
  className?: string;
  children: React.ReactNode;
}

function PromptInputActions({ className, children }: PromptInputActionsProps) {
  return (
    <div className={cn("flex items-center gap-1 px-2 pb-2", className)}>
      {children}
    </div>
  );
}

interface PromptInputActionProps {
  tooltip: string;
  children: React.ReactNode;
}

function PromptInputAction({ tooltip, children }: PromptInputActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// CustomDivider
// ───────────────────────────────────────────────────────────────────────────

function CustomDivider() {
  return <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />;
}

// ───────────────────────────────────────────────────────────────────────────
// PromptInputBox (main export)
// ───────────────────────────────────────────────────────────────────────────

export interface PromptInputBoxProps {
  onSend?: (message: string, files?: File[]) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

const ACCENT = {
  search: "#1EAEDB",
  think: "#8B5CF6",
  canvas: "#F97316",
} as const;

type Mode = keyof typeof ACCENT | null;

export const PromptInputBox = React.forwardRef<
  HTMLDivElement,
  PromptInputBoxProps
>(function PromptInputBox(
  {
    onSend,
    isLoading = false,
    placeholder = "Ask Clōd anything…",
    className,
  },
  ref: React.Ref<HTMLDivElement>,
) {
  const [value, setValue] = React.useState("");
  const [mode, setMode] = React.useState<Mode>(null);
  const [files, setFiles] = React.useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [recording, setRecording] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "TEXTAREA" &&
        document.activeElement?.tagName !== "INPUT"
      ) {
        e.preventDefault();
        textareaRef.current?.focus();
      }
      if (e.key === "Escape") {
        textareaRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = React.useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend?.(trimmed, files.length ? files : undefined);
    setValue("");
    setFiles([]);
  }, [value, files, isLoading, onSend]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
    e.target.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const previewFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const toggleMode = (m: NonNullable<Mode>) =>
    setMode((cur) => (cur === m ? null : m));

  const accentBgFor = (m: NonNullable<Mode>) =>
    mode === m
      ? { backgroundColor: `${ACCENT[m]}1F`, color: ACCENT[m] }
      : undefined;
  const accentBorderFor = (m: NonNullable<Mode>) =>
    mode === m ? { borderColor: `${ACCENT[m]}66` } : undefined;

  return (
    <TooltipProvider delayDuration={150}>
      <div ref={ref} className={cn("w-full", className)}>
        <PromptInput
          value={value}
          onValueChange={setValue}
          isLoading={isLoading}
          onSubmit={submit}
          disabled={recording}
        >
          {/* Attachments preview row */}
          <AnimatePresence>
            {files.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap gap-2 px-3 pt-3"
              >
                {files.map((f, i) => (
                  <button
                    key={`${f.name}-${i}`}
                    type="button"
                    onClick={() => previewFile(f)}
                    className="group flex items-center gap-2 rounded-md border border-border bg-accent/40 px-2 py-1 text-xs text-foreground hover:bg-accent"
                  >
                    <Paperclip className="h-3 w-3" />
                    <span className="max-w-[14ch] truncate">{f.name}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Remove ${f.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(i);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          removeFile(i);
                        }
                      }}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {recording ? (
            <VoiceRecorder
              isRecording={recording}
              onStartRecording={() => {}}
              onStopRecording={() => setRecording(false)}
            />
          ) : (
            <PromptInputTextarea
              placeholder={placeholder}
              textareaRef={textareaRef}
            />
          )}

          <PromptInputActions className="justify-between pl-2 pr-2">
            <div className="flex items-center gap-1">
              <PromptInputAction tooltip="Attach file">
                <PromptButton
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach file"
                  disabled={recording}
                >
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                </PromptButton>
              </PromptInputAction>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                accept="image/*,.pdf,.txt,.csv,.json,.md"
                onChange={handleFileChange}
              />

              <CustomDivider />

              <PromptInputAction tooltip="Search the web">
                <PromptButton
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleMode("search")}
                  className="gap-1.5 px-2"
                  style={{
                    ...accentBgFor("search"),
                    ...accentBorderFor("search"),
                  }}
                  aria-pressed={mode === "search"}
                >
                  <Globe
                    className="h-4 w-4"
                    style={{
                      color: mode === "search" ? ACCENT.search : undefined,
                    }}
                  />
                  <span className="hidden text-xs sm:inline">Search</span>
                </PromptButton>
              </PromptInputAction>

              <PromptInputAction tooltip="Think harder">
                <PromptButton
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleMode("think")}
                  className="gap-1.5 px-2"
                  style={{
                    ...accentBgFor("think"),
                    ...accentBorderFor("think"),
                  }}
                  aria-pressed={mode === "think"}
                >
                  <BrainCog
                    className="h-4 w-4"
                    style={{
                      color: mode === "think" ? ACCENT.think : undefined,
                    }}
                  />
                  <span className="hidden text-xs sm:inline">Think</span>
                </PromptButton>
              </PromptInputAction>

              <PromptInputAction tooltip="Open canvas">
                <PromptButton
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleMode("canvas")}
                  className="gap-1.5 px-2"
                  style={{
                    ...accentBgFor("canvas"),
                    ...accentBorderFor("canvas"),
                  }}
                  aria-pressed={mode === "canvas"}
                >
                  <FolderCode
                    className="h-4 w-4"
                    style={{
                      color: mode === "canvas" ? ACCENT.canvas : undefined,
                    }}
                  />
                  <span className="hidden text-xs sm:inline">Canvas</span>
                </PromptButton>
              </PromptInputAction>
            </div>

            <div className="flex items-center gap-1">
              <PromptInputAction
                tooltip={recording ? "Stop recording" : "Voice input"}
              >
                <PromptButton
                  variant="ghost"
                  size="icon"
                  onClick={() => setRecording((r) => !r)}
                  aria-label={recording ? "Stop recording" : "Start recording"}
                >
                  <Mic className="h-4 w-4 text-muted-foreground" />
                </PromptButton>
              </PromptInputAction>

              <PromptInputAction
                tooltip={isLoading ? "Stop" : "Send (Enter)"}
              >
                <PromptButton
                  size="icon"
                  className="h-8 w-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={submit}
                  disabled={!isLoading && value.trim().length === 0}
                  aria-label={isLoading ? "Stop" : "Send"}
                >
                  {isLoading ? (
                    <Square className="h-3.5 w-3.5 text-primary-foreground" />
                  ) : (
                    <ArrowUp className="h-4 w-4 text-primary-foreground" />
                  )}
                </PromptButton>
              </PromptInputAction>
            </div>
          </PromptInputActions>
        </PromptInput>
        <ImageViewDialog imageUrl={previewUrl} onClose={closePreview} />
      </div>
    </TooltipProvider>
  );
});

PromptInputBox.displayName = "PromptInputBox";

// Internal exports kept for any consumer that wants to compose primitives
export {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
  CustomDivider,
};
