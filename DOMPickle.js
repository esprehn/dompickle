var DOMPickle = (() => {
  const kHtmlNs = "http://www.w3.org/1999/xhtml";

  function serializeAttributes(element) {
    if (!element.hasAttributes())
      return null;
    let result = [];
    for (let attr of element.attributes)
      result.push([attr.name, attr.value]);
    return result;
  }

  // TODO(esprehn): Expand this list for other elements and properties with
  // unreflected state.
  const kNodePropertyHandlers = {
    "INPUT": function(element) {
      return ["value", element.value];
    },
  };

  function serializeProperties(element) {
    let handler = kNodePropertyHandlers[element.tagName];
    if (handler)
      return handler(element);
    return null;
  }

  function serializeChildren(node) {
    // Hackily serialize html imports preserving just nested imports and
    // elements which could apply style.
    if (node.tagName === "LINK" && node.import) {
      let children = node.import.querySelectorAll("link, style");
      let result = [];
      for (let child of children)
        result.push(serializeNode(child));
      return result;
    }
    if (!node.firstChild)
      return null;
    let result = [];
    for (let child = node.firstChild; child; child = child.nextSibling) {
      let data = serializeNode(child);
      if (data)
        result.push(data);
    }
    // result could be empty if all the children were node types we don't
    // serialize like Comment's.
    return result.length ? result : null;
  }

  function serializeShadowRoots(node) {
    if (!node.shadowRoot)
      return null;
    let result = [];
    for (let root = node.shadowRoot; root; root = root.olderShadowRoot) {
      result.unshift([
        // Hack to detect if the ShadowRoot is v0 or v1, this is the only way
        // I could figure out how to detect, and it only works for non-empty
        // ShadowRoots, but that's probably fine.
        root.querySelector(":host /deep/ *") ? 0 : 1,
        serializeChildren(root),
      ]);
    }
    return result;
  }

  function serializeNode(node) {
    // TODO(esprehn): Handle DocumentFragment.
    switch (node.nodeType) {
    case Node.ELEMENT_NODE:
      return [
        Node.ELEMENT_NODE,
        // Elide the namespaceURI for html to avoid bloating the output.
        node.namespaceURI === kHtmlNs ? null : node.namespaceURI,
        node.tagName,
        serializeAttributes(node),
        serializeProperties(node),
        serializeShadowRoots(node),
        // Drop all children of script tags. We also filter these in the inflate
        // step, but we drop them here to reduce the size of the serialized
        // node tree.
        node.tagName === "SCRIPT" ? null : serializeChildren(node),
      ];
    case Node.TEXT_NODE:
      return [
        Node.TEXT_NODE,
        node.nodeValue,
      ];
    case Node.DOCUMENT_NODE:
      return [
        Node.DOCUMENT_NODE,
        node.compatMode,
        serializeChildren(node),
      ];
    }
    return null;
  }
  
  function isRelImport(data) {
    return data.find(([name, value]) =>
        name === "rel" && value.trim().toLowerCase() === "import");
  }

  function inflateAttributes(element, data) {
    if (!data)
      return;
    let tagName = element.tagName.toUpperCase();
    // TODO(esprehn): Use a map from tagName to attribute filters instead of
    // comparing tag names inside the attribute loop.
    for (let [name, value] of data) {
      // Avoid running script tags or loading embedded media.
      if ((tagName === "SCRIPT" || tagName == "IFRAME") &&
          name === "src")
        continue;
      // Skip html imports.
      if (tagName === "LINK" && name === "href" && isRelImport(data))
        continue;
      // Drop all inline event handlers.
      if (name.startsWith("on"))
        continue;
      element.setAttribute(name, value);
    }
  }

  function inflateProperties(element, data) {
    if (!data)
      return;
    for (let [name, value] of data)
      element[name] = value;
  }

  function inflateChildren(doc, parent, data) {
    if (!data)
      return;
    for (let item of data)
      parent.appendChild(inflateNode(item, doc));
  }
  
  function inflateShadowRoots(doc, element, data) {
    if (!data)
      return;
    for (let item of data) {
      // item[0] has either 1 or 0 for the Shadow DOM version.
      let shadowRoot = item[0] ? element.attachShadow({mode: "open"})
          : element.createShadowRoot();
      inflateChildren(doc, shadowRoot, item[1]);
    }
  }

  function inflateNode(data, doc=document) {
    // TODO(esprehn): Handle DocumentFragment.
    switch (data[0]) {
    case Node.DOCUMENT_NODE:
      let result = doc.implementation.createHTMLDocument();
      if (data[1] != "CSS1Compat") {
        // Terrible hack to get the document into quirks mode, there's no other
        // obvious way to get a quirks document out of DOMImplementation.
        result.open();
        result.write("");
        result.close();
      }
      // createHTMLDocument() creates the default document structure but we
      // need to start empty instead.
      result.documentElement.remove();
      inflateChildren(result, result, data[2]);
      return result;
    case Node.ELEMENT_NODE:
      let element = data[1] ? doc.createElementNS(data[1], data[2]) :
          doc.createElement(data[2]);
      inflateAttributes(element, data[3]);
      inflateProperties(element, data[4]);
      inflateShadowRoots(doc, element, data[5]);
      // Skip the contents of all script tags. The serializer also drops them,
      // but this makes sure hand crafted input never runs script.
      // TODO(esprehn): Use node processors instead.
      if (element.tagName.toUpperCase() !== "SCRIPT")
        inflateChildren(doc, element, data[6]);
      return element;
    case Node.TEXT_NODE:
      return doc.createTextNode(data[1]);
    }
    console.error(`Failed to inflate node of type '${data[0]}'.`);
    return null;
  }

  return {
    serialize: serializeNode,
    inflate: inflateNode,
  };
})();
