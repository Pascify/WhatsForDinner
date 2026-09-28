import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy" };

const CONTACT = process.env.GMAIL_USER ?? "the address in the app";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Privacy policy</h1>
      <p className="mb-8 text-sm text-stone-500">WhatsForDinner. Last updated 27 September 2026.</p>

      <div className="space-y-6 text-sm leading-6">
        <section>
          <h2 className="mb-1 font-medium">What this is</h2>
          <p>
            WhatsForDinner plans a week of dinners and sends it to you on WhatsApp. It is a personal
            project, run at no cost, and it does not sell anything.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-medium">What we store</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Your name, as you give it during sign-up.</li>
            <li>Your email address, used only to send one-time login codes and your plans.</li>
            <li>Your WhatsApp number, used only to send you the plans you asked for.</li>
            <li>Your food preferences and rules, and the meals you add or hide.</li>
            <li>Your plans and which meals were served, so weeks do not repeat.</li>
            <li>A record of each message we sent you, for delivery and cost tracking.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 font-medium">What we do not store</h2>
          <p>
            No payment details, no location, no contacts, and no message content beyond the commands
            you send the bot. One-time codes are stored hashed and deleted after they expire, and
            login sessions are stored as a hash of a random token.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-medium">Who else sees it</h2>
          <p>
            Three services, each only what it needs: Meta, to deliver WhatsApp messages; Google, to
            deliver email; MongoDB Atlas, which stores the database. Nothing is sold, shared for
            advertising, or sent anywhere else.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-medium">Stopping and deleting</h2>
          <p>
            Send <span className="font-medium">stop</span> to the bot at any time and it stops
            messaging you. Send <span className="font-medium">delete</span>, or use the website, to
            erase your account, plans and preferences. Deletion is immediate and cannot be undone.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-medium">Contact</h2>
          <p>Questions or a deletion request: {CONTACT}.</p>
        </section>
      </div>
    </main>
  );
}
