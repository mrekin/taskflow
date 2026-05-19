"use client"

import { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

interface EmptyStateAction {
  label: string
  onClick: () => void
  icon?: LucideIcon
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: EmptyStateAction
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="py-12 text-center text-muted-foreground border rounded-lg border-dashed">
      <Icon className="size-10 mx-auto mb-3 opacity-40" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs mt-1">{description}</p>
      {action && (
        <Button size="sm" variant="outline" onClick={action.onClick} className="mt-3">
          {action.icon && <action.icon className="size-4 mr-1" />} {action.label}
        </Button>
      )}
    </div>
  )
}
