"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-slate-900/60 duration-100 backdrop-blur-[2px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  // Χωρίς δικό του padding από τον καλούντα + DialogBody μέσα → αυτόματη διάταξη «άκρη-άκρη»:
  // το σώμα κυλά, κεφαλίδα/υποσέλιδο σταθερά. Πριν: p-6 του παραθύρου ΣΥΝ px-5 του σώματος
  // έτρωγαν ~90px σε κινητό 375px και τα πεδία έβγαιναν δεξιά εκτός παραθύρου.
  const autoBody = !/(^|\s)(p|px|py|pt|pb)-/.test(typeof className === "string" ? className : "")
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          // ΠΑΝΤΑ ΧΩΡΑΕΙ ΣΤΗΝ ΟΘΟΝΗ: στήλη flex με όριο ύψους σε dvh (σωστό και με τη μπάρα του
          // Safari). Κεφαλίδα/υποσέλιδο δεν συρρικνώνονται· ένα σώμα με overflow (DialogBody ή
          // div με overflow-auto) παίρνει τον χώρο που μένει και κυλά μόνο αυτό.
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-1rem)] w-full max-w-[calc(100%-1rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl bg-card p-6 text-sm text-foreground border border-border shadow-pop duration-100 outline-none sm:max-h-[calc(100dvh-2rem)] sm:max-w-md data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          "[&>[data-slot=dialog-footer]]:shrink-0 [&>[data-slot=dialog-header]]:shrink-0",
          autoBody && [
            "[&:has([data-slot=dialog-body])]:gap-0 [&:has([data-slot=dialog-body])]:p-0",
            "[&:has([data-slot=dialog-body])>form]:flex [&:has([data-slot=dialog-body])>form]:min-h-0 [&:has([data-slot=dialog-body])>form]:flex-col",
            "[&:has([data-slot=dialog-body])_[data-slot=dialog-header]]:shrink-0 [&:has([data-slot=dialog-body])_[data-slot=dialog-header]]:px-5 [&:has([data-slot=dialog-body])_[data-slot=dialog-header]]:pt-4 [&:has([data-slot=dialog-body])_[data-slot=dialog-header]]:pb-3 [&:has([data-slot=dialog-body])_[data-slot=dialog-header]]:pr-12",
            "[&:has([data-slot=dialog-body])_[data-slot=dialog-footer]]:m-0 [&:has([data-slot=dialog-body])_[data-slot=dialog-footer]]:shrink-0",
          ],
          className,
          // Εφεδρεία: αν το περιεχόμενο δεν έχει δικό του σώμα που κυλά (π.χ. ένα <form> τυλίγει
          // τα πάντα), κυλά ολόκληρο το παράθυρο αντί να κόβεται. Υπερισχύει του `overflow-hidden`
          // των καλούντων — εκείνο έκοβε το κάτω μέρος (και τα κουμπιά) χωρίς τρόπο πρόσβασης.
          "overflow-x-hidden overflow-y-auto overscroll-contain"
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2 right-2"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

/**
 * Το σώμα ενός παραθύρου που ΚΥΛΑ ΜΟΝΟ ΑΥΤΟ: κεφαλίδα και υποσέλιδο μένουν σταθερά και η μπάρα
 * κύλισης ζει μέσα στην κάρτα, μακριά από τις στρογγυλεμένες γωνίες. Χρήση με
 * `<DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0">`:
 *   <DialogHeader className="px-5 pt-4 pb-3" /> <DialogBody>…</DialogBody> <DialogFooter className="m-0" />
 */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3 [scrollbar-gutter:stable]", className)}
      {...props}
    />
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-6 -mb-6 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
