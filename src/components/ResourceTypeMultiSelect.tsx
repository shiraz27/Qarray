import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ResourceTypeOption {
  id: number;
  type: string;
}

interface ResourceTypeMultiSelectProps {
  options: ResourceTypeOption[];
  value: number[];
  onChange: (next: number[]) => void;
  placeholder?: string;
  className?: string;
}

export const ResourceTypeMultiSelect: React.FC<ResourceTypeMultiSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select resource types",
  className,
}) => {
  const [open, setOpen] = React.useState(false);

  const toggle = (id: number) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  const remove = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== id));
  };

  const selectedOptions = options.filter((o) => value.includes(o.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between min-h-10 h-auto py-2 font-normal",
            className,
          )}
        >
          <div className="flex flex-wrap gap-1 items-center flex-1">
            {selectedOptions.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selectedOptions.map((o) => (
                <Badge
                  key={o.id}
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  {o.type}
                  <span
                    role="button"
                    aria-label={`Remove ${o.type}`}
                    onClick={(e) => remove(o.id, e)}
                    className="ml-0.5 hover:text-destructive cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </Badge>
              ))
            )}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-1" align="start">
        <div className="max-h-64 overflow-auto">
          {options.map((o) => {
            const checked = value.includes(o.id);
            return (
              <button
                type="button"
                key={o.id}
                onClick={() => toggle(o.id)}
                className={cn(
                  "flex items-center gap-2 w-full text-left px-2 py-2 rounded-sm hover:bg-accent text-sm",
                  checked && "bg-accent/50",
                )}
              >
                <Checkbox checked={checked} aria-hidden tabIndex={-1} />
                <span className="flex-1">{o.type}</span>
                {checked && <Check className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ResourceTypeMultiSelect;