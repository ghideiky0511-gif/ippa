import assert from "node:assert/strict";
import test from "node:test";
import { parseVestiCatalogFeed } from "./mapper";

test("lê SKU e galeria completa, inclusive additional_image_link sem prefixo", () => {
    const feed = parseVestiCatalogFeed(`
      <rss xmlns:g="http://base.google.com/ns/1.0"><channel>
        <item>
          <g:item_group_id>ref-1</g:item_group_id>
          <g:id>17621</g:id>
          <g:title>TOP RENDA LASTEX</g:title>
          <g:image_link>https://cdn.example.com/principal.png</g:image_link>
          <additional_image_link>https://cdn.example.com/2.png</additional_image_link>
          <additional_image_link>https://cdn.example.com/3.png</additional_image_link>
          <additional_image_link>https://cdn.example.com/look.mp4</additional_image_link>
          <color>OFF WHITE</color><size>20</size><g:availability>in_stock</g:availability>
        </item>
        <item>
          <g:item_group_id>ref-1</g:item_group_id>
          <g:id>17622</g:id>
          <g:title>TOP RENDA LASTEX</g:title>
          <g:image_link>https://cdn.example.com/principal.png</g:image_link>
          <g:additional_image_link>https://cdn.example.com/4.png</g:additional_image_link>
          <color>OFF WHITE</color><size>22</size><g:availability>in_stock</g:availability>
        </item>
      </channel></rss>
    `);

    assert.equal(feed.variants[0]?.productCode, "17621");
    assert.deepEqual(feed.products[0]?.imageUrls, [
        "https://cdn.example.com/principal.png",
        "https://cdn.example.com/2.png",
        "https://cdn.example.com/3.png",
        "https://cdn.example.com/4.png",
    ]);
    assert.deepEqual(feed.products[0]?.videoUrls, ["https://cdn.example.com/look.mp4"]);
});
