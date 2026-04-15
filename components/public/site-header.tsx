import Image from "next/image";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="bg-[#0c1723]">
      <div className="mx-auto flex w-full max-w-7xl px-4 py-2.5 sm:px-6 sm:py-4 lg:px-8">
        <Link href="/events" className="shrink-0">
          <Image
            src="/autodrome-header-logo.svg"
            alt="Dubai Autodrome"
            width={180}
            height={61}
            className="h-7 w-auto sm:h-10"
            priority
          />
        </Link>
      </div>
    </header>
  );
}
