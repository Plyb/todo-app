declare module 'pulltorefreshjs' {
  interface PullToRefreshInstance {
    destroy(): void
  }
  interface PullToRefreshOptions {
    mainElement?: string
    instructionsPullToRefresh?: string
    instructionsReleaseToRefresh?: string
    instructionsRefreshing?: string
    refreshTimeout?: number
    onRefresh?: () => void
    shouldPullToRefresh?: () => boolean
  }
  const PullToRefresh: {
    init(options: PullToRefreshOptions): PullToRefreshInstance
  }
  export default PullToRefresh
}
