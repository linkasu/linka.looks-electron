export interface PageElementsState{
    id: string,
    bounds: DOMRect[]
}
export interface BrowserElementsState extends PageElementsState{
    elements: Element[]
}