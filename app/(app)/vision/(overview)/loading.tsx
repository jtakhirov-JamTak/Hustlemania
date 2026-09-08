/** F9: the overview's shapes while the vision loads — kicker, two title lines, two buttons, three cards. No layout shift. */
export default function VisionLoading() {
  return (
    <div aria-busy="true" aria-label="Loading the vision">
      <div className="v-head">
        <span className="v-skel v-skel-kicker" />
        <span className="v-skel v-skel-meta" />
      </div>
      <div className="v-skel v-skel-h1" />
      <div className="v-skel v-skel-h1 v-skel-h1-short" />
      <div className="v-actions">
        <span className="v-skel v-skel-btn v-skel-btn-short" />
        <span className="v-skel v-skel-btn" />
      </div>
      <div className="v-cards">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card v-mini">
            <span className="v-skel v-skel-kicker-short" />
            <span className="v-skel v-skel-body" />
            <span className="v-skel v-skel-sub" />
          </div>
        ))}
      </div>
    </div>
  );
}
