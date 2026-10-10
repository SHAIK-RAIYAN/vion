import React from "react";
import ReusableErrorBoundary from "./ReusableErrorBoundary";

/**
 * Example 1: Localized Video Player Boundary
 * If the video player crashes (e.g. media codec error, stream decoding issue),
 * the rest of the page (title, channel info, comments, sidebar) remains completely functional!
 */
export const VideoPlayerSection = ({ videoId }: { videoId: string }) => {
  return (
    <ReusableErrorBoundary
      resetKeys={[videoId]} // Automatically resets when navigating to another video
      fallbackRender={(error, resetErrorBoundary) => (
        <div style={styles.videoPlayerFallback}>
          <div style={styles.badge}>Player Error</div>
          <h4>Unable to play this video stream</h4>
          <p>{error?.message || "Stream initialization failed"}</p>
          <button style={styles.primaryButton} onClick={resetErrorBoundary}>
            Reload Video Player
          </button>
        </div>
      )}
      onError={(error, errorInfo) => {
        console.error("Telemetry [VideoPlayer Error]:", error, errorInfo);
      }}
    >
      <div style={styles.playerWrapper}>
        {/* Your <VideoPlayer /> component goes here */}
        <p>Video Player Stream [{videoId}]</p>
      </div>
    </ReusableErrorBoundary>
  );
};

/**
 * Example 2: Localized Comments Section Boundary
 * If comments fail to parse or render, the video continues playing uninterrupted.
 */
export const CommentsSection = ({ uploadId }: { uploadId: string }) => {
  return (
    <ReusableErrorBoundary
      resetKeys={[uploadId]}
      fallbackRender={(error, resetErrorBoundary) => (
        <div style={styles.cardFallback}>
          <h4>Comments unavailable right now</h4>
          <button style={styles.secondaryButton} onClick={resetErrorBoundary}>
            Retry Loading Comments
          </button>
        </div>
      )}
    >
      <div style={styles.commentsWrapper}>
        {/* Your <CommentsList /> component goes here */}
        <p>Comments for upload {uploadId}</p>
      </div>
    </ReusableErrorBoundary>
  );
};

/**
 * Example 3: Full YouTube Watch Page assembling localized error boundaries
 */
export const WatchPageExample = () => {
  return (
    <div style={styles.pageLayout}>
      <main style={styles.mainContent}>
        {/* Video Player in its own boundary */}
        <VideoPlayerSection videoId="vid-1001" />

        {/* Video Details */}
        <div style={styles.metaSection}>
          <h2>Sample Video Title</h2>
          <p>12,450 views • Uploaded 2 days ago</p>
        </div>

        {/* Comments Section in its own boundary */}
        <CommentsSection uploadId="vid-1001" />
      </main>

      <aside style={styles.sidebar}>
        {/* Recommendations in its own boundary */}
        <ReusableErrorBoundary
          fallback={
            <div style={styles.cardFallback}>
              <p>Recommended videos temporarily unavailable.</p>
            </div>
          }
        >
          <h3>Up Next</h3>
          <p>Recommended videos list...</p>
        </ReusableErrorBoundary>
      </aside>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  pageLayout: {
    display: "flex",
    gap: "24px",
    padding: "20px",
    background: "#0f0f0f",
    color: "#ffffff",
    minHeight: "100vh",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  mainContent: {
    flex: 3,
  },
  sidebar: {
    flex: 1,
    borderLeft: "1px solid #272727",
    paddingLeft: "16px",
  },
  playerWrapper: {
    aspectRatio: "16 / 9",
    background: "#000000",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  videoPlayerFallback: {
    aspectRatio: "16 / 9",
    background: "#18181b",
    borderRadius: "12px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "#f43f5e",
    gap: "10px",
  },
  cardFallback: {
    padding: "16px",
    background: "#18181b",
    borderRadius: "8px",
    border: "1px solid #272727",
    textAlign: "center",
  },
  badge: {
    background: "#e11d48",
    color: "#ffffff",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: "bold",
  },
  metaSection: {
    margin: "16px 0",
  },
  commentsWrapper: {
    marginTop: "24px",
    padding: "16px",
    background: "#18181b",
    borderRadius: "8px",
  },
  primaryButton: {
    padding: "8px 16px",
    background: "#3b82f6",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "6px 12px",
    background: "#272727",
    color: "#ffffff",
    border: "1px solid #3f3f46",
    borderRadius: "6px",
    cursor: "pointer",
  },
};

export default WatchPageExample;
