import type { CSSProperties } from "react";

/** Decorative loading/reveal effect. Never renders actual ciphertext or keys. */
export function DecipherText({
  text,
  pending = false,
}: {
  text?: string;
  pending?: boolean;
}) {
  const characters = Array.from(pending ? "•".repeat(24) : (text ?? ""));
  return (
    <span className="decipher-text" data-pending={pending}>
      <span className="sr-only">
        {pending ? "Opening encrypted plan" : text}
      </span>
      <span aria-hidden="true">
        {characters.map((character, index) => (
          <span
            className="decipher-glyph"
            key={index}
            style={
              {
                "--reveal-delay": `${Math.min(index, 40) * 12}ms`,
                "--scramble-delay": `${-index * 73}ms`,
              } as CSSProperties
            }
          >
            <span className="decipher-letter">{character}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
