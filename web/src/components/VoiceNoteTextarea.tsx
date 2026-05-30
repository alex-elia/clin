"use client";

import { useState } from "react";
import { appendTranscriptToText } from "@/lib/speechRecognition";
import { VoiceInputButton } from "@/components/VoiceInputButton";

type VoiceNoteTextareaProps = {
  name: string;
  rows?: number;
  placeholder?: string;
  defaultValue?: string;
  language?: string | null;
  className?: string;
  label?: React.ReactNode;
};

/** Uncontrolled textarea + mic (for server-rendered forms). */
export function VoiceNoteTextarea({
  name,
  rows = 5,
  placeholder,
  defaultValue = "",
  language,
  className = "clin-input mt-1",
  label,
}: VoiceNoteTextareaProps) {
  const [value, setValue] = useState(defaultValue);

  return (
    <label className="block text-sm">
      {label}
      <div className="mt-1 flex gap-2">
        <textarea
          name={name}
          rows={rows}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className={`min-h-0 flex-1 ${className}`}
        />
        <VoiceInputButton
          language={language}
          onAppend={(text) => setValue((v) => appendTranscriptToText(v, text))}
        />
      </div>
    </label>
  );
}
