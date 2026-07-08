declare module 'pulltorefresh' {
  interface PullToRefreshInstance {
    destroy(): void
  }
  interface PullToRefreshOptions {
    mainElement?: string
    onRefresh?: () => void
    shouldPullToRefresh?: () => boolean
  }
  const PullToRefresh: {
    init(options: PullToRefreshOptions): PullToRefreshInstance
  }
  export default PullToRefresh
}
