module Static exposing (..)

import Html
import Html.Attributes
import One.Strings


main =
    Html.div [ Html.Attributes.id "Static" ]
        [ Html.h1 [] [ Html.text "Static" ]
        , Html.ol []
            [ Html.li [ Html.Attributes.id "self" ]
                [ Html.text self ]
            , Html.li [ Html.Attributes.id "string1" ]
                [ Html.text One.Strings.string1 ]
            , Html.li [ Html.Attributes.id "string12" ]
                [ Html.text One.Strings.string12 ]
            ]
        ]


self =
    "#self:0"
