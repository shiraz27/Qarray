import React from "react";
import { cn } from "@/lib/utils";

interface ResourceTypeBadgesProps {
  typeIds?: number[] | null;
  fallbackTypeId?: number | null;
  resourceTypes: Array<{ id: number; type: string }>;
  className?: string;
}

/**
 * Renders one small badge per resource type id.
 * Falls back to `fallbackTypeId` when `typeIds` is empty (legacy rows).
 */
export const ResourceTypeBadges: React.FC<ResourceTypeBadgesProps> = ({
  typeIds,
  fallbackTypeId,
  resourceTypes,
  className,
}) => {
  const ids =
    typeIds && typeIds.length > 0
      ? typeIds
      : fallbackTypeId
        ? [fallbackTypeId]
        : [];
  if (ids.length === 0) return null;

  return (
    <>
      {ids.map((id) => {
        const t = resourceTypes.find((rt) => rt.id === id);
        if (!t) return null;
        return (
          <span
            key={id}
            className={cn(
              "text-xs px-2 py-1 bg-primary/10 text-primary rounded-full whitespace-nowrap",
              className,
            )}
          >
            {t.type}
          </span>
        );
      })}
    </>
  );
};

export default ResourceTypeBadges;