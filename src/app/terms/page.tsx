import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Terms of use</h1>
      <p className="mb-8 text-sm text-stone-500">WhatsForDinner. Last updated 27 September 2026.</p>

      <div className="space-y-6 text-sm leading-6">
        <section>
          <h2 className="mb-1 font-medium">What you get</h2>
          <p>
            A weekly dinner plan, generated from a meal list and the rules you set, delivered to
            WhatsApp or email. It is free, and it is a personal project rather than a business.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-medium">What it is not</h2>
          <p>
            Not nutritional, medical or dietary advice. Allergies and dietary needs are yours to
            check. A rule such as halal or vegetarian filters the meal list as tagged, and the tags
            are only as accurate as whoever entered them.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-medium">Fair use</h2>
          <p>
            Do not use the service to send messages to people who have not asked for them. Each
            person signs up for themselves, from their own number.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-medium">No guarantees</h2>
          <p>
            The service runs on free hosting and may be slow, interrupted or withdrawn without
            notice. Plans may fail to arrive. Nothing here is guaranteed, and there is no liability
            for a missed dinner.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-medium">Leaving</h2>
          <p>
            Send <span className="font-medium">stop</span> to pause, or{" "}
            <span className="font-medium">delete</span> to remove your account and everything
            attached to it.
          </p>
        </section>
      </div>
    </main>
  );
}
