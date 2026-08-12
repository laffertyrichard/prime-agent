import { Type, type TUnsafe } from "typebox";

export function StringEnum<const Values extends readonly string[]>(values: Values): TUnsafe<Values[number]> {
	return Type.Unsafe<Values[number]>({ type: "string", enum: [...values] });
}

export function truncateHead(content: string): { content: string; truncated: false } {
	return { content, truncated: false };
}
