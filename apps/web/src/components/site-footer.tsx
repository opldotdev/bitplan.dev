export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-[42rem] px-6 py-10">
      <p className="text-muted-foreground text-sm">
        BitPlan — plans on the chain, not on a server. ©{" "}
        {new Date().getFullYear()}
      </p>
    </footer>
  );
}
