export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
          <h2 className="text-lg font-bold text-white">General Rules</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors text-2xl leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 text-sm text-slate-200 leading-relaxed">
          {/* Dates */}
          <div className="text-center text-slate-400 text-xs font-medium uppercase tracking-wide">
            Begins Feb 27 @ 6:00pm UTC / 1:00pm EST &nbsp;·&nbsp; Ends Mar 8 @
            8:00pm UTC / 3:00pm EST
          </div>

          {/* Important Info */}
          <section className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-1">
            <h3 className="text-red-400 font-semibold text-xs uppercase tracking-wide mb-2">
              Important Info
            </h3>
            <p>
              Hiding outside of clan chat during this bingo will result in your
              team <strong className="text-white">losing 100 points</strong>.
            </p>
            <p>
              Your submission screenshots need to be{" "}
              <strong className="text-white">full-client screenshots</strong>.
            </p>
          </section>

          {/* Codeword */}
          <section>
            <h3 className="text-indigo-400 font-semibold mb-2">Codeword</h3>
            <p>
              Each team will be assigned a unique Codeword. Upon the completion
              of a tile, that Codeword along with the date and time must be
              visible on-screen via the{" "}
              <strong className="text-white">"Clan Events" plugin</strong> for a
              screenshot to suffice as evidence. If you can't use the Clan
              Events plugin (mobile or vanilla client), you must type the
              codeword in the chatbox. Teams will be given their Codewords at
              the start of the event.
            </p>
          </section>

          {/* Alting */}
          <section>
            <h3 className="text-indigo-400 font-semibold mb-2">
              Usage of Other Accounts (Alting)
            </h3>
            <p className="mb-3">
              For those with multiple accounts, only one account's submissions
              will count.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                <div className="text-green-400 font-semibold text-xs uppercase tracking-wide mb-2">
                  Allowed
                </div>
                <ul className="space-y-1 text-slate-300">
                  <li>· Scouting (raid layouts, wildy cave alarm, etc.)</li>
                  <li>· Scaling</li>
                  <li>· Resupplying</li>
                  <li>· Other QoL (be reasonable)</li>
                </ul>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <div className="text-red-400 font-semibold text-xs uppercase tracking-wide mb-2">
                  Disallowed
                </div>
                <ul className="space-y-1 text-slate-300">
                  <li>
                    · DPS-increasing uses (tanking, spec transferring, "dolo"
                    methods)
                  </li>
                </ul>
              </div>
            </div>
            <p className="mt-3 text-slate-400 italic">
              Alts are not allowed in any way that would significantly benefit
              your team. This includes using non-team players for "altable"
              activities (e.g. a friend in full justiciar tanking Bandos). Doing
              CoX or ToB with a friend is fine as long as they aren't feeding
              you points.
            </p>
          </section>

          {/* Drop Rules */}
          <section>
            <h3 className="text-indigo-400 font-semibold mb-2">
              Drop-Specific Rules
            </h3>
            <p className="font-semibold text-white">
              Item drops only count towards the team of the player who received
              that drop (CoX, ToB, GWD, etc.).
            </p>
            <p className="mt-2">
              Normal clan rules still apply —{" "}
              <strong className="text-white">we split by default</strong> unless
              explicitly stated otherwise. If you do content with non-team CC
              members and get a drop, it counts for your board only — do so at
              your own risk.
            </p>
            <p className="mt-2 text-slate-400 italic">
              Players/teams found cheating may be disqualified and will not
              receive their buy-in or winnings.
            </p>
          </section>

          {/* Prizes */}
          <section>
            <h3 className="text-indigo-400 font-semibold mb-2">Prizes</h3>
            <p className="text-white font-semibold">
              The Bingo Pot is 900m (may be subject to change).
            </p>
            <p className="mt-1 text-slate-400">
              Split TBD via polling. In the case of a tie, the first team to
              reach that point total wins.
            </p>
          </section>

          {/* Q&A */}
          <section>
            <h3 className="text-indigo-400 font-semibold mb-3">
              Important Notes
            </h3>
            <div className="space-y-3">
              <div>
                <div className="font-semibold text-white mb-1">
                  Why do I need to send a picture of my bank?
                </div>
                <p className="text-slate-400">
                  For things like caskets (clue scrolls are fine), Wintertodt,
                  or Tempoross, we have no way to verify if you had stacked up
                  caskets/permits beforehand. If you have not sent a picture
                  there is a chance we cannot verify your drop.{" "}
                  <em>Please encourage all team members to do so.</em>
                </p>
              </div>
              <div>
                <div className="font-semibold text-white mb-1">
                  Chat Notifications
                </div>
                <p className="text-slate-400">
                  You will need the "Chat Notifications" setting enabled for
                  this bingo.
                </p>
              </div>
            </div>
          </section>

          {/* Fine Print */}
          <section className="bg-slate-700/20 border border-slate-600/40 rounded-lg p-4 space-y-2 text-slate-400 text-xs italic">
            <h3 className="text-slate-300 font-semibold text-sm not-italic mb-1">
              Fine Print
            </h3>
            <p>
              Be a responsible gamer. Take regular breaks, and try not to play
              18-hour days.
            </p>
            <p>We may adjust tiles on the board based on how the bingo goes.</p>
            <p>
              If you have any questions or would like clarifications for any
              tile, please feel free to ask in{" "}
              <strong className="text-slate-300 not-italic">
                #bingo-general
              </strong>
              .
            </p>
            <p>
              Be nice and respect the bingo mods! They're taking time out of
              their day to help during this event.
            </p>
          </section>

          {/* Base Tile Rules */}
          <section className="bg-slate-700/40 rounded-lg p-4">
            <h3 className="text-indigo-400 font-semibold mb-3">
              Base Tile Rules
            </h3>
            <ul className="space-y-2 text-slate-300">
              <li>
                · All tiles have partial and full completion points (Part A
                &amp; Part B).
              </li>
              <li>
                · You may submit for Part B before finishing Part A, but Part B
                points are only awarded after Part A is complete.
              </li>
              <li>
                · Lines have point values:{" "}
                <strong className="text-white">15 points per line</strong>.
              </li>
              <li>
                · All raid, Colosseum, and Doom tiles have a{" "}
                <strong className="text-white">2-hour freeze period</strong> —
                you cannot obtain items for or submit their content for the
                first 2 hours of bingo.
              </li>
              <li>
                · Tip: use the search bar above the board to search tiles.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
