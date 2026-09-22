"""Build the 50-per-style citation CSV from the gold samples plus labeled expansions."""

from __future__ import annotations

import csv
from pathlib import Path

OUT = Path(__file__).resolve().parent / "citations_labeled.csv"

GOLD = [
    ("American Psychological Association. (2020). Publication manual of the American Psychological Association (7th ed.). https://doi.org/10.1037/0000165-000", "APA", True, ""),
    ("Grady, J. S., Her, M., Moreno, G., Perez, C., & Yelinek, J. (2019). Emotions in storybooks: A comparison of storybooks that represent ethnic and racial groups in the United States. Psychology of Popular Media Culture, 8(3), 207–217. https://doi.org/10.1037/ppm0000185", "APA", True, ""),
    ("National Institute of Mental Health. (2021, July). Anxiety disorders. U.S. Department of Health and Human Services. https://www.nimh.nih.gov/health/topics/anxiety-disorders", "APA", True, ""),
    ('Jerrentrup, A., Mueller, T., Glowalla, U., Herder, M., Henrichs, N., Neubauer, A., & Schaefer, J. R. (2018). Teaching medicine with the help of "Dr. House". PLOS ONE, 13(3), Article e0193972. https://doi.org/10.1371/journal.pone.0193972', "APA", True, ""),
    ("Fouad, N. A., & Byars-Winston, A. M. (2005). Cultural context of career choice: Meta-analysis of race/ethnicity differences. The Career Development Quarterly, 53(3), 223–233. https://doi.org/10.1002/j.2161-0045.2005.tb00992.x", "APA", True, ""),
    ("Henley, Patricia. The Hummingbird House. MacMurray, 1999.", "MLA", True, ""),
    ('Boyle, T. Coraghessan. "Greasy Lake." The Norton Introduction to Literature, edited by Alison Booth and Kelly J. Mays, Norton, 2011, pp. 118-125.', "MLA", True, ""),
    ('Wordsworth, William. "Composed upon Westminster Bridge, September 3, 1802." Poetry Foundation, www.poetryfoundation.org/poems/45514/composed-upon-westminster-bridge-september-3-1802. Accessed 20 May 2020.', "MLA", True, ""),
    ('Dean, Cornelia. "Executive on a Mission: Saving the Planet." The New York Times, 22 May 2007, www.nytimes.com/2007/05/22/business/22ander.html.', "MLA", True, ""),
    ('Eliot, T. S. "The Waste Land." The Norton Anthology of English Literature, edited by Stephen Greenblatt, 9th ed., vol. F, Norton, 2012, pp. 2369-2385.', "MLA", True, ""),
    ('J. C. Maxwell, "A dynamical theory of the electromagnetic field," Philosophical Transactions of the Royal Society of London, vol. 155, pp. 459–512, 1865.', "IEEE", True, ""),
    ('R. E. Kalman, "A new approach to linear filtering and prediction problems," Journal of Basic Engineering, vol. 82, no. 1, pp. 35–45, Mar. 1960.', "IEEE", True, ""),
    ('I. S. Jacobs and C. P. Bean, "Fine particles, thin films and exchange anisotropy," in Magnetism, vol. III, G. T. Rado and H. Suhl, Eds. New York, NY, USA: Academic Press, 1963, pp. 271–350.', "IEEE", True, ""),
    ('C. E. Shannon, "A mathematical theory of communication," The Bell System Technical Journal, vol. 27, no. 3, pp. 379–423, Jul. 1948.', "IEEE", True, ""),
    ('IEEE, "IEEE Standard for Floating-Point Arithmetic," IEEE Std 754-2019, pp. 1–84, Jul. 2019, doi: 10.1109/IEEESTD.2019.8766229.', "IEEE", True, ""),
]

APA_OK = [
    "McCauley, S. M., & Christiansen, M. H. (2019). Language learning as language use: A cross-linguistic model of child language development. Psychological Review, 126(1), 1–51. https://doi.org/10.1037/rev0000126",
    "Anderson, M. (2018). Getting consistent with consequences. Educational Leadership, 76(1), 26–33.",
    "Goldman, C. (2018, November 28). The complicated calibration of love, especially in adoption. Chicago Tribune.",
    "Kalnay, E., Kanamitsu, M., Kistler, R., Collins, W., Deaven, D., Gandin, L., Iredell, M., Saha, S., White, G., Woollen, J., Zhu, Y., Leetmaa, A., Reynolds, R., Chelliah, M., Ebisuzaki, W., Higgins, W., Janowiak, J., Mo, K. C., Ropelewski, C., ... Joseph, D. (1996). The NCEP/NCAR 40-year reanalysis project. Bulletin of the American Meteorological Society, 77(3), 437–471. https://doi.org/10.1175/1520-0477(1996)077<0437:TNYRP>2.0.CO;2",
    "World Health Organization. (2018, May 24). The top 10 causes of death. https://www.who.int/news-room/fact-sheets/detail/the-top-10-causes-of-death",
    "Harlow, H. F. (1983). Fundamentals for preparing psychology journal articles. Journal of Comparative and Physiological Psychology, 55(6), 893–896.",
    "Scruton, R. (1996). The eclipse of listening. The New Criterion, 15(3), 5–13.",
    "Baniya, S., & Weech, S. (2019). Data and experience design: Negotiating community-oriented digital research with service-learning. Purdue Journal of Service-Learning and International Engagement, 6(1), 11–16. https://doi.org/10.5703/1288284316979",
    "Schenkman, L. (2021, April 6). Why the immune system can't fight the coronavirus. Science. https://doi.org/10.1126/science.abi8016",
    "Merriam-Webster. (n.d.). Semantics. In Merriam-Webster.com dictionary. Retrieved January 12, 2024, from https://www.merriam-webster.com/dictionary/semantics",
    "Bublitz, W., & Norrick, N. R. (Eds.). (2011). Foundations of pragmatics. De Gruyter Mouton.",
    "Piaget, J. (1988). Extracts from Piaget's theory (G. Gellerier & J. Langer, Trans.). In K. Richardson & S. Sheldon (Eds.), Cognitive development to adolescence: A reader (pp. 3–18). Erlbaum. (Original work published 1966)",
    "Shore, M. F. (2014, June 25). Marking time in the land of plenty: Reflections on mental health in the United States. American Journal of Orthopsychiatry, 84(Suppl. 3), S6–S14. https://doi.org/10.1037/h0098946",
    "Harris, L. (2014). Instructional leadership perceptions and practices of elementary school leaders [Unpublished doctoral dissertation]. University of Virginia.",
    "Axelrod, A. (2019, October 11). How to disagree with someone more powerful than you. Harvard Business Review. https://hbr.org/2016/03/how-to-disagree-with-someone-more-powerful-than-you",
    "Ouellette, J. (2019, November 15). Physicists capture first footage of quantum tricks that make magnetism arise. Ars Technica. https://arstechnica.com/science/2019/11/physicists-capture-first-footage-of-quantum-tricks-that-make-magnetism-arise/",
    "U.S. Census Bureau. (n.d.). U.S. and world population clock. U.S. Department of Commerce. Retrieved January 9, 2020, from https://www.census.gov/popclock/",
    "Mack, R., & Spake, G. (2018). Citing open source images and formatting references for presentations [PowerPoint slides]. Canvas@FNU. https://fnu.onelogin.com/login",
    "Bergeson, S. (2019). Really cool neutral plasmas. Science, 363(6422), 33–34. https://doi.org/10.1126/science.aau7988",
    "Butler, J. (2017). Where's the media in mass communication? Communication Research and Practice, 3(2), 99–118. https://doi.org/10.1080/22041451.2016.1269258",
    "Lippincott, T., & Poindexter, E. K. (2020). Emotion recognition in children with autism spectrum disorder: A review. Clinical Psychology Review, 78, Article 101855. https://doi.org/10.1016/j.cpr.2020.101855",
    "Chafe, W. (1994). Discourse, consciousness, and time: The flow and displacement of conscious experience in speaking and writing. University of Chicago Press.",
    "Tolin, D. F., Gilliam, C., Wootton, B. M., Bowe, W., Bragdon, L. B., Davis, E., Hannan, S. E., Steinman, S. A., Worden, B., & Hallion, L. S. (2018). Psychometric properties of a structured diagnostic interview for DSM-5 anxiety, mood, and obsessive-compulsive and related disorders. Assessment, 25(1), 3–13. https://doi.org/10.1177/1073191116638410",
    "Duckworth, A. L., Quirk, A., Gallop, R., Hoyle, R. H., Kelly, D. R., & Matthews, M. D. (2019). Cognitive and noncognitive predictors of success. Proceedings of the National Academy of Sciences, 116(47), 23499–23504. https://doi.org/10.1073/pnas.1910510116",
    "Cuellar, N. G. (2016). Study abroad programs [Editorial]. Journal of Transcultural Nursing, 27(3), 209. https://doi.org/10.1177/1043659616638722",
]

APA_BAD = [
    ("Grady, J. S., Her, M., Moreno, G., Perez, C., and Yelinek, J. 2019. Emotions in storybooks. Psychology of Popular Media Culture, 8(3), 207-217.", "Year is not placed in parentheses after the author names"),
    ("National Institute of Mental Health. Anxiety disorders. 2021. https://www.nimh.nih.gov/health/topics/anxiety-disorders", "Publication date is missing after the author and is not in APA order"),
    ("Jerrentrup A, Mueller T, Glowalla U (2018) Teaching medicine with the help of Dr. House. PLOS ONE 13(3).", "Author initials lack commas/periods and the title is not in sentence case APA form"),
    ("Fouad, Nadya A., and Byars-Winston, Angela M. (2005). Cultural context of career choice. The Career Development Quarterly.", "APA requires inverted names with initials, not full given names joined by and"),
    ("American Psychological Association 2020 Publication manual of the American Psychological Association 7th ed.", "Missing parentheses around the year and missing italicized source punctuation"),
    ('[1] McCauley, S. M., & Christiansen, M. H., "Language learning as language use," Psychological Review, 2019.', "Uses IEEE numbering and quoted title instead of APA author-year form"),
    ("Anderson, M. Getting consistent with consequences. Educational Leadership 76.1 (2018): 26-33.", "Uses MLA parentheses-around-year and colon page pattern instead of APA"),
    ("World Health Organization. The top 10 causes of death. Retrieved from https://www.who.int/", "Uses outdated Retrieved from wording and omits the date element"),
    ("Harlow, H. F. (1983, Fundamentals for preparing psychology journal articles. Journal of Comparative and Physiological Psychology.", "Broken year parentheses and missing issue, page, and closing punctuation"),
    ("Scruton, R. (1996) The eclipse of listening The New Criterion 15(3) 5-13", "Missing periods after the year and between title, source, and pages"),
    ("Baniya, S. & Weech, S. (2019) Data and experience design. Purdue Journal of Service-Learning, vol. 6, no. 1, pp. 11-16.", "Uses IEEE vol./no./pp. labels instead of APA 6(1), 11-16"),
    ("Schenkman, L. (April 6, 2021). Why the immune system can't fight the coronavirus. Science.", "Date is not in APA order: year, month day inside one parenthesis set"),
    ("Merriam-Webster. Semantics. Merriam-Webster.com dictionary. n.d.", "n.d. belongs in parentheses after the author, not at the end"),
    ("Piaget, J. 1966/1988. Extracts from Piaget's theory. Cognitive development to adolescence.", "Republished-work years are not formatted as APA original-publication parentheses"),
    ("Harris, L. (2014). Instructional leadership perceptions and practices of elementary school leaders. Unpublished.", "Doctoral dissertation is not identified with bracketed description and institution"),
    ("Axelrod, A. How to disagree with someone more powerful than you. Harvard Business Review, October 11, 2019.", "Date is written in MLA/newspaper order instead of APA (2019, October 11)"),
    ("Ouellette, J. (2019). Physicists capture first footage of quantum tricks. Ars Technica. Page 1.", "Adds a Page label that APA journal/web references do not use"),
    ("U.S. Census Bureau. (n.d.) U.S. and world population clock, U.S. Department of Commerce, https://www.census.gov/popclock/", "Uses commas instead of APA periods between elements and omits retrieved date"),
    ("Bergeson, S. (2019), Really cool neutral plasmas, Science, 363(6422), 33-34.", "Uses commas after the year and title instead of APA periods"),
    ("Duckworth et al 2019 Cognitive and noncognitive predictors of success PNAS.", "et al. is not punctuated and the reference omits APA initials, commas, and source details"),
]

MLA_OK = [
    'Dillard, Annie. Pilgrim at Tinker Creek. Harper, 1974.',
    'Gleick, James. Chaos: Making a New Science. Penguin, 1987.',
    'Wysocki, Anne Frances, et al. Writing New Media: Theory and Applications for Expanding the Teaching of Composition. Utah State UP, 2004.',
    'Wysocki, Anne Frances. "The Multiple Media of Texts: How Onscreen and Paper Texts Incorporate Words, Images, and Other Media." What Writing Does and How It Does It, edited by Charles Bazerman and Paul Prior, Lawrence Erlbaum, 2004, pp. 123-163.',
    'Crowley, Sharon, and Debra Hawhee. Ancient Rhetorics for Contemporary Students. 3rd ed., Pearson, 2004.',
    'Bagchi, Alaknanda. "Conflicting Nationalisms: The Voice of the Subaltern in Mahasweta Devi\'s Bashai Tudu." Tulsa Studies in Women\'s Literature, vol. 15, no. 1, 1996, pp. 41-50.',
    'Langhamer, Claire. "Love and Courtship in Mid-Twentieth-Century England." Historical Journal, vol. 50, no. 1, 2007, pp. 173-196. ProQuest, doi:10.1017/S0018246X06005966.',
    'Kincaid, Jamaica. "Girl." The Vintage Book of Contemporary American Short Stories, edited by Tobias Wolff, Vintage, 1994, pp. 306-307.',
    'Aristotle. Poetics. Translated by S. H. Butcher, The Internet Classics Archive, 2009, classics.mit.edu/Aristotle/poetics.html.',
    'Craig, Jacob. "The Loss of Learning." Enculturation, vol. 23, 2016, www.enculturation.net/the-loss-of-learning.',
    'Hollmichel, Stefanie. "The Reading Brain: Differences between Digital and Print." So Many Books, 25 Apr. 2013, somanybooksblog.com/2013/04/25/the-reading-brain-differences-between-digital-and-print/.',
    'Nordquist, Richard. "What Is a Noun?" ThoughtCo, 28 May 2019, www.thoughtco.com/what-is-a-noun-1691442.',
    'Wheelis, Mark. "Investigating Disease Outbreaks Under a Protocol to the Biological and Toxin Weapons Convention." Emerging Infectious Diseases, vol. 6, no. 6, 2000, pp. 595-600.',
    'Lundman, Susan. "How to Make Vegetarian Chili." eHow, www.ehow.com/how_10727_make-vegetarian-chili.html. Accessed 6 July 2015.',
    'Sohmer, Sarah. "Memories of Childhood." Reading and Writing Quarterly, vol. 15, no. 2, 1999, pp. 123-134.',
    'Ponce de Leon, Juana. "The Afterlife of Cervantes." Modern Language Quarterly, vol. 62, no. 2, 2001, pp. 149-169.',
    'United Nations. Consequences of Rapid Population Growth in Developing Countries. Taylor and Francis, 1991.',
    'Gowdy, John. "Avoiding Self-Organized Extinction: Toward a Co-Evolutionary Economics of Sustainability." International Journal of Sustainable Development and World Ecology, vol. 14, no. 1, 2007, pp. 27-36.',
    'Bent, Henry E. "Professionalization of the Ph.D. Degree." The Journal of Higher Education, vol. 30, no. 3, 1959, pp. 151-160. JSTOR, www.jstor.org/stable/1978286.',
    'Dolby, Nadine. "Research in Youth Culture and Policy: Current Conditions and Future Directions." Social Work and Society: The International Online-Only Journal, vol. 6, no. 2, 2008, www.socwork.net/sws/article/view/60/362.',
    'Williams, David Adams. "The Flight from Conversation." The New York Times, 21 Apr. 2012, www.nytimes.com/2012/04/22/opinion/sunday/the-flight-from-conversation.html.',
    'Hanging Fire. Directed by Spike Lee, 40 Acres and a Mule Filmworks, 1989.',
    'Beethoven, Ludwig van. Moonlight Sonata. 1801, Piano Sonata No. 14.',
    'Smith, Jane. Interview. Conducted by John Doe, 15 Mar. 2019.',
    'Modern Language Association. MLA Handbook. 9th ed., Modern Language Association of America, 2021.',
]

MLA_BAD = [
    ("Henley, Patricia. (1999). The Hummingbird House. MacMurray.", "Uses APA year-in-parentheses instead of MLA Author. Title. Publisher, year"),
    ('Boyle, T. Coraghessan (2011) "Greasy Lake" The Norton Introduction to Literature pp 118-125.', "Missing MLA commas, the word edited by, and a period after the title"),
    ("Wordsworth, William. Composed upon Westminster Bridge. Poetry Foundation. Accessed 20 May 2020.", "Poem title is not in quotation marks"),
    ('Dean, Cornelia. "Executive on a Mission: Saving the Planet." The New York Times. May 22, 2007.', "Date is not in MLA day Month year order"),
    ('Eliot, T.S. The Waste Land. Norton Anthology of English Literature, 2012, pages 2369-2385.', "Title lacks quotation marks and uses pages instead of pp."),
    ("Dillard, Annie (1974) Pilgrim at Tinker Creek, Harper.", "Year is parenthetical like APA and commas replace MLA periods"),
    ('Gleick, James. "Chaos: Making a New Science." Penguin, 1987.', "A book title is placed in quotation marks instead of being unquoted/italic"),
    ("Wysocki, Anne Frances, et. al. Writing New Media. Utah State UP, 2004.", "et al. is incorrectly punctuated as et. al."),
    ('Bagchi, Alaknanda. Conflicting Nationalisms. Tulsa Studies in Women\'s Literature, vol 15, no 1, 1996, 41-50.', "Article title lacks quotes and page numbers omit pp."),
    ("Langhamer, Claire. Love and Courtship. Historical Journal 50.1 (2007): 173-196.", "Uses older MLA parentheses volume(issue) colon pages instead of vol./no./pp."),
    ('Kincaid, Jamaica. Girl. Vintage Book of Contemporary American Short Stories, Wolff, Vintage, 1994.', "Missing quotation marks and the phrase edited by"),
    ("Aristotle. Poetics. Translated by S. H. Butcher. 2009. https://classics.mit.edu/Aristotle/poetics.html", "Uses a full https URL instead of MLA's host-style location"),
    ("Craig, Jacob. The Loss of Learning. Enculturation, 23, 2016.", "Article title is not in quotation marks and vol. is omitted"),
    ("Nordquist, Richard. What Is a Noun? ThoughtCo, 28 May 2019.", "Article title is missing quotation marks"),
    ("Wheelis, Mark. (2000). Investigating Disease Outbreaks. Emerging Infectious Diseases, 6(6), 595-600.", "APA author-year and 6(6) issue form instead of MLA vol./no./pp."),
    ('Lundman, Susan. "How to Make Vegetarian Chili." eHow. Retrieved July 6, 2015.', "Uses APA Retrieved instead of MLA Accessed day Month year"),
    ("United Nations. (1991). Consequences of Rapid Population Growth in Developing Countries. Taylor and Francis.", "APA year parentheses on a book that should be MLA Publisher, year"),
    ('Bent, Henry E. "Professionalization of the Ph.D. Degree," The Journal of Higher Education, vol. 30, no. 3, pp. 151-160, 1959.', "IEEE comma-quoted title and year at the end instead of MLA punctuation"),
    ("Williams, David Adams. The Flight from Conversation. New York Times 21 April 2012.", "Title lacks quotes and April is not abbreviated as Apr."),
    ("Modern Language Association, MLA Handbook, 9th edition, 2021.", "Uses commas throughout instead of MLA periods and omits the publisher element"),
]

IEEE_OK = [
    'D. E. Knuth, "The Art of Computer Programming," 3rd ed., vol. 1, Boston, MA, USA: Addison-Wesley, 1997.',
    'S. Zhang, C. Zhu, J. K. O. Sin, and P. K. T. Mok, "A novel ultrathin elevated channel low-temperature poly-Si TFT," IEEE Electron Device Lett., vol. 20, pp. 569–571, Nov. 1999.',
    'M. Wegmuller, J. P. von der Weid, P. Oberson, and N. Gisin, "High resolution fiber distributed measurements with coherent OFDR," in Proc. ECOC\'00, 2000, paper 11.3.4, p. 109.',
    'R. J. Vidmar, "On the use of atmospheric plasmas as electromagnetic reflectors," IEEE Trans. Plasma Sci., vol. 21, no. 3, pp. 876–880, Aug. 1992, doi: 10.1109/27.256703.',
    'J. Padhye, V. Firoiu, and D. Towsley, "A stochastic model of TCP Reno congestion avoidance and control," Univ. of Massachusetts, Amherst, MA, USA, CMPSCI Tech. Rep. 99-02, 1999.',
    'Wireless LAN Medium Access Control (MAC) and Physical Layer (PHY) Specification, IEEE Std 802.11, 1997.',
    'G. Eason, B. Noble, and I. N. Sneddon, "On certain integrals of Lipschitz-Hankel type involving products of Bessel functions," Phil. Trans. Roy. Soc. London, vol. A247, pp. 529–551, Apr. 1955.',
    'J. Clerk Maxwell, A Treatise on Electricity and Magnetism, 3rd ed., vol. 2. Oxford, U.K.: Clarendon, 1892, pp. 68–73.',
    'I. S. Jacobs and C. P. Bean, Fine particles, thin films and exchange anisotropy. New York, NY, USA: Academic, 1963.',
    'Y. Yorozu, M. Hirano, K. Oka, and Y. Tagawa, "Electron spectroscopy studies on magneto-optical media and plastic substrate interface," IEEE Transl. J. Magn. Jpn., vol. 2, pp. 740–741, Aug. 1987.',
    'M. Young, The Technical Writer\'s Handbook. Mill Valley, CA, USA: University Science, 1989.',
    'T. L. Saaty, "Decision making with the analytic hierarchy process," Int. J. Serv. Sci., vol. 1, no. 1, pp. 83–98, 2008.',
    'A. K. Jain, J. Mao, and K. M. Mohiuddin, "Artificial neural networks: A tutorial," Computer, vol. 29, no. 3, pp. 31–44, Mar. 1996.',
    'Y. LeCun, Y. Bengio, and G. Hinton, "Deep learning," Nature, vol. 521, no. 7553, pp. 436–444, May 2015.',
    'I. Goodfellow, Y. Bengio, and A. Courville, Deep Learning. Cambridge, MA, USA: MIT Press, 2016.',
    'J. D. Hunter, "Matplotlib: A 2D graphics environment," Comput. Sci. Eng., vol. 9, no. 3, pp. 90–95, 2007.',
    'F. Chollet et al., "Keras," 2015. [Online]. Available: https://keras.io',
    'M. Abadi et al., "TensorFlow: A system for large-scale machine learning," in Proc. 12th USENIX Symp. Oper. Syst. Design Implement. (OSDI), 2016, pp. 265–283.',
    'A. Vaswani et al., "Attention is all you need," in Proc. Adv. Neural Inf. Process. Syst. (NeurIPS), 2017, pp. 5998–6008.',
    'J. Devlin, M. Chang, K. Lee, and K. Toutanova, "BERT: Pre-training of deep bidirectional transformers for language understanding," in Proc. NAACL-HLT, 2019, pp. 4171–4186.',
    'K. He, X. Zhang, S. Ren, and J. Sun, "Deep residual learning for image recognition," in Proc. IEEE Conf. Comput. Vis. Pattern Recognit. (CVPR), 2016, pp. 770–778.',
    'A. Krizhevsky, I. Sutskever, and G. E. Hinton, "ImageNet classification with deep convolutional neural networks," in Proc. Adv. Neural Inf. Process. Syst. (NIPS), 2012, pp. 1097–1105.',
    'C. Szegedy et al., "Going deeper with convolutions," in Proc. IEEE Conf. Comput. Vis. Pattern Recognit. (CVPR), 2015, pp. 1–9.',
    'G. Hinton, O. Vinyals, and J. Dean, "Distilling the knowledge in a neural network," arXiv:1503.02531, 2015.',
    'N. Srivastava, G. Hinton, A. Krizhevsky, I. Sutskever, and R. Salakhutdinov, "Dropout: A simple way to prevent neural networks from overfitting," J. Mach. Learn. Res., vol. 15, pp. 1929–1958, 2014.',
]

IEEE_BAD = [
    ("Maxwell, J. C. (1865). A dynamical theory of the electromagnetic field. Philosophical Transactions of the Royal Society of London, 155, 459-512.", "Uses APA author-year instead of IEEE initials, quoted title, vol., and pp."),
    ('Kalman, R. E. "A new approach to linear filtering and prediction problems." Journal of Basic Engineering 82.1 (1960): 35-45.', "Uses MLA title quotes and 82.1 (year): pages instead of IEEE vol./no./pp."),
    ("I. S. Jacobs and C. P. Bean, Fine particles, thin films and exchange anisotropy, Academic Press, 1963, pages 271-350.", "Book-in-collection is missing in ... Eds. and uses pages instead of pp."),
    ("C. E. Shannon, A mathematical theory of communication, The Bell System Technical Journal, vol 27, no 3, pp 379-423, July 1948.", "Title is not in quotation marks and month is not abbreviated as Jul."),
    ("IEEE Standard for Floating-Point Arithmetic, IEEE Std 754-2019, July 2019.", "Standard title is not quoted and month is not abbreviated"),
    ('D. E. Knuth, The Art of Computer Programming, 3rd edition, Addison-Wesley, 1997.', "Missing quoted chapter/book handling, ed. abbreviation, and city/state publisher form"),
    ("S. Zhang et al (1999) A novel ultrathin elevated channel low-temperature poly-Si TFT. IEEE Electron Device Lett.", "et al. lacks a period and the paper uses APA year parentheses"),
    ('M. Wegmuller. High resolution fiber distributed measurements. Proc. ECOC 00. 2000.', "Title is not in quotation marks and in Proc. commas are missing"),
    ("R. J. Vidmar, On the use of atmospheric plasmas as electromagnetic reflectors, IEEE Trans. Plasma Sci., Volume 21, Number 3, pages 876-880, August 1992.", "Uses Volume/Number/pages/August instead of vol./no./pp./Aug."),
    ("J. Padhye, V. Firoiu, and D. Towsley (1999) A stochastic model of TCP Reno. University of Massachusetts.", "Technical report is written in APA form without quoted title or Tech. Rep. label"),
    ('G. Eason, B. Noble, and I. N. Sneddon. "On certain integrals of Lipschitz-Hankel type." Phil. Trans. Roy. Soc. London. 1955.', "Missing vol., pp., and abbreviated month before the year"),
    ("Y. Yorozu et al., Electron spectroscopy studies, IEEE Transl. J. Magn. Jpn., 2, 740-741, 1987.", "Title is not quoted and vol./pp. labels are omitted"),
    ("M. Young. The Technical Writer's Handbook. Mill Valley: University Science. 1989.", "Uses MLA periods and omits CA, USA in the publisher location"),
    ('T. L. Saaty, Decision making with the analytic hierarchy process, Int. J. Serv. Sci., 1(1), 83-98, 2008.', "Title is not quoted and APA 1(1) is used instead of vol. 1, no. 1, pp."),
    ("A. K. Jain, J. Mao, and K. M. Mohiuddin. Artificial neural networks: A tutorial. Computer, March 1996, 29(3):31-44.", "Missing quotes, IEEE vol./no./pp. order, and Mar. abbreviation before the year"),
    ("Y. LeCun, Y. Bengio, and G. Hinton (2015) Deep learning. Nature 521, 436-444.", "APA year parentheses and missing quoted title plus vol./no./pp."),
    ("I. Goodfellow, Y. Bengio, and A. Courville. Deep Learning. MIT Press, 2016.", "Book reference omits city, state, country before the publisher"),
    ('F. Chollet et al. Keras. Available: https://keras.io', "Online source is missing year and the [Online]. Available: IEEE pattern"),
    ("A. Vaswani et al. Attention is all you need. NeurIPS 2017, pages 5998-6008.", "Conference paper is missing in Proc., quoted title, and pp."),
    ("K. He, X. Zhang, S. Ren, and J. Sun, Deep residual learning for image recognition, CVPR, 2016.", "Conference title is not quoted and in Proc. IEEE Conf. form is missing"),
]


def main() -> None:
    rows = list(GOLD)
    rows.extend((text, "APA", True, "") for text in APA_OK)
    rows.extend((text, "APA", False, issue) for text, issue in APA_BAD)
    rows.extend((text, "MLA", True, "") for text in MLA_OK)
    rows.extend((text, "MLA", False, issue) for text, issue in MLA_BAD)
    rows.extend((text, "IEEE", True, "") for text in IEEE_OK)
    rows.extend((text, "IEEE", False, issue) for text, issue in IEEE_BAD)

    counts: dict[str, int] = {}
    for _, style, _, _ in rows:
        counts[style] = counts.get(style, 0) + 1
    if counts != {"APA": 50, "MLA": 50, "IEEE": 50}:
        raise SystemExit(f"Expected 50 rows per style, got {counts}")

    with OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["citation_text", "citation_style", "is_format_compliant", "issue_description"])
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows to {OUT} ({counts})")


if __name__ == "__main__":
    main()
